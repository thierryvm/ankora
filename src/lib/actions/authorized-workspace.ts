import { MFA_REQUISE, elevationDue } from '@/lib/auth/require-elevated';
import { createClient } from '@/lib/supabase/server';

/**
 * Le contrôle d'autorisation partagé par les Server Actions de mutation.
 *
 * ## Pas de `'use server'` ici, et c'est structurel
 *
 * Un fichier porteur de la directive ne peut exporter QUE des fonctions async
 * exposées comme Server Actions (règle 9 du `CLAUDE.md`, vérifiée par
 * `npm run lint:use-server`). Ceci est de l'infrastructure appelée PAR des
 * Server Actions, jamais depuis un client — l'exposer en endpoint POST serait
 * publier le contrôle d'accès lui-même. Même raison que
 * `expense-entry.types.ts`.
 *
 * ## Pourquoi ce module existe alors que six copies restent en place
 *
 * Cette fonction est **dupliquée à l'identique dans six fichiers** :
 * `expenses.ts`, `charges.ts`, `charge-payments.ts`, `commitments.ts`,
 * `charge-conversion.ts`, `obligations.ts`. Elles ne sont pas migrées ici, et
 * ce n'est pas un oubli :
 *
 * - migrer une copie sur six ne réduit rien et crée une asymétrie NEUVE — un
 *   module « canonique » qui laisse croire que les cinq autres lui sont égales,
 *   alors que personne ne l'aura vérifié ;
 * - migrer les six traverse toutes les mutations de l'application : c'est une
 *   PR dédiée, avec ses agents QA et sa propre revue ;
 * - modifier le chemin d'autorisation d'`expenses.ts` pour un gain fonctionnel
 *   nul, dans une PR « créer une catégorie », est du scope creep au sens du
 *   `CLAUDE.md`.
 *
 * Ce module est donc la copie canonique **pour les nouveaux appelants**, et la
 * dette des six est tracée plutôt que traitée à moitié.
 */
export type AuthorizedWorkspace =
  { ok: true; userId: string; workspaceId: string } | { ok: false; errorCode: string };

export async function authorizedWorkspace(): Promise<AuthorizedWorkspace> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, errorCode: 'errors.session.expired' };

  // Seconde couche, et celle qui protège LES DONNÉES. Un Server Action est un
  // endpoint POST joignable sans jamais rendre la page qui l'appelle : le garde
  // de page laisserait chaque lecture et chaque écriture ouvertes à une session
  // qui n'a jamais présenté son second facteur.
  if (await elevationDue(supabase, user)) return { ok: false, errorCode: MFA_REQUISE };

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'editor'])
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) return { ok: false, errorCode: 'errors.db.workspaceNotFound' };
  return { ok: true, userId: user.id, workspaceId: membership.workspace_id };
}
