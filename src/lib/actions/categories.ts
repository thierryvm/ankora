'use server';

import { authorizedWorkspace } from '@/lib/actions/authorized-workspace';
import { revalidateAppPath, revalidateDashboard } from '@/lib/actions/revalidate';
import { CATEGORY_KINDS, categorieHomonyme } from '@/lib/domain/categories';
import { expenseCategoryInputSchema } from '@/lib/schemas/category';
import { AuditEvent, logAuditEvent } from '@/lib/security/audit-log';
import { rateLimit } from '@/lib/security/rate-limit';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/types';
import type { CreatedExpenseCategory } from '@/lib/actions/categories.types';

/**
 * Crée une catégorie de dépense depuis la feuille de saisie ⊕ (ADR-043 D1).
 *
 * ## Ce qui est en dur, et pourquoi ce n'est pas une limitation
 *
 * `kind: 'variable'`, aucun sélecteur. Une catégorie créée depuis la feuille de
 * **dépense** est une catégorie de dépense. Offrir le choix « dépense ou
 * facture » à ce moment-là, c'est demander à quelqu'un qui note 12 € de courses
 * de comprendre l'invariant de non-double-comptage d'ADR-035 §5. Un sélecteur
 * qui n'a qu'une bonne réponse n'est pas un choix, c'est un piège avec une case
 * à cocher.
 *
 * `category_group` n'est **pas renseigné** — il reste NULL (ADR-043 D3). La
 * tentation était d'écrire `'vie_courante'`, mais écrire un groupe que personne
 * n'a choisi met de l'argent dans un total que l'utilisateur n'a jamais
 * autorisé, sous un nom fabriqué. La migration qui a créé la colonne l'écrit
 * déjà pour son propre rattrapage : « better than guessing ».
 *
 * ## Aucune migration n'a été nécessaire
 *
 * `categories_editor_write` est `for all` avec
 * `with check (is_workspace_editor(workspace_id) and created_by = auth.uid())`.
 * Sur un INSERT, seul `WITH CHECK` s'applique : poser `created_by` suffit.
 */
export async function createExpenseCategoryAction(
  input: unknown,
): Promise<ActionResult<CreatedExpenseCategory>> {
  const ctx = await authorizedWorkspace();
  if (!ctx.ok) return ctx;

  const rl = await rateLimit('mutation', `user:${ctx.userId}`);
  if (!rl.success) return { ok: false, errorCode: 'errors.session.rateLimited' };

  const parsed = expenseCategoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'errors.validation.generic',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();

  // Le contrôle de doublon lit la liste, puis compare en TS — jamais un
  // `.ilike()`, qui prend un MOTIF : un nom contenant « % » y matcherait tout,
  // serait déclaré doublon pour toujours, et deviendrait impossible à créer.
  //
  // Lecture directe, et NON via `getCategories`, qui replie sur `[]` en cas
  // d'erreur (repli délibéré et documenté à sa définition — un écran vide y est
  // moins grave qu'un plantage). Ici ce repli serait pire que l'erreur : il
  // rendrait le contrôle muet, et créerait le doublon qu'il existe pour
  // empêcher. Une lecture qui échoue doit refuser, pas laisser passer.
  const { data: existantes, error: erreurLecture } = await supabase
    .from('categories')
    .select('id, name, kind')
    .eq('workspace_id', ctx.workspaceId);

  if (erreurLecture || !existantes) {
    return { ok: false, errorCode: 'errors.categories.createFailed' };
  }

  const homonyme = categorieHomonyme(
    parsed.data.name,
    // `kind` est contraint par un `check` en base, mais les types générés
    // l'élargissent à `string`. On valide plutôt que de caster : une ligne au
    // `kind` inconnu ne doit pas décider du message affiché.
    existantes.flatMap((ligne) => {
      const kind = CATEGORY_KINDS.find((k) => k === ligne.kind);
      return kind ? [{ name: ligne.name, kind }] : [];
    }),
  );
  if (homonyme) {
    // Deux messages, parce que la moitié des homonymes possibles sont des
    // catégories de FACTURE, que le sélecteur de dépense ne montre jamais
    // (ADR-035 §5). Dire « existe déjà » à propos d'une ligne invisible fait
    // passer l'application pour cassée.
    return {
      ok: false,
      errorCode:
        homonyme.kind === 'variable'
          ? 'errors.categories.duplicate'
          : 'errors.categories.duplicateBill',
    };
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      name: parsed.data.name,
      color_token: parsed.data.colorToken,
      kind: 'variable',
      is_system: false,
    })
    .select('id, name, color_token')
    .single();

  if (error || !data) return { ok: false, errorCode: 'errors.categories.createFailed' };

  // Les métadonnées sont le TROISIÈME argument, et la clé est en snake_case.
  // Les deux se composent en un piège silencieux : `AuditContext` ne porte que
  // userId / workspaceId / ipAddress / userAgent, et `sanitizeMetadata` jette
  // sans un mot toute clé absente de sa liste blanche. Un `resourceId`
  // camelCase passé en 2e position donnerait un test vert et un journal vide.
  await logAuditEvent(
    AuditEvent.CATEGORY_CREATED,
    { userId: ctx.userId, workspaceId: ctx.workspaceId },
    { resource_id: data.id, resource_type: 'category' },
  );

  revalidateDashboard();
  revalidateAppPath('expenses');

  return {
    ok: true,
    data: {
      id: data.id,
      name: data.name,
      colorToken: parsed.data.colorToken,
    },
  };
}
