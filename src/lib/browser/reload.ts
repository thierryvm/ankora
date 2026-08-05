/**
 * Recharge le document.
 *
 * Une fonction d'une ligne dans son propre module, et ce n'est pas de la
 * cérémonie : sous jsdom, `window.location` et sa méthode `reload` sont
 * déclarées non configurables et non inscriptibles (« unforgeables » de la
 * spécification HTML). Ni `vi.spyOn`, ni une affectation directe, ni
 * `vi.stubGlobal` ne peuvent les remplacer — vérifié, aucun test de ce dépôt
 * n'y parvient. Sans cette couture, le seul test possible du rechargement
 * serait un test qui ne teste rien.
 */
export function reloadPage(): void {
  window.location.reload();
}
