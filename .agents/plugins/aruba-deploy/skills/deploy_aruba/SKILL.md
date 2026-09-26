---
name: deploy_aruba
description: "Deploya il progetto corrente su Aruba via FTP ed espone l'URL di test. Usa questa skill INVECE di npm run dev per testare l'applicazione."
---

# Deploy Aruba (Test Workflow)

Questa skill ti permette di testare l'applicazione caricando la build direttamente sull'ambiente di test remoto ospitato su Aruba. 

## Istruzioni
Quando decidi di testare le tue modifiche o il progetto nel suo insieme:

1. **Non avviare server locali:** Evita di usare `npm run dev` o altri server in `localhost`. Non potrai testarli adeguatamente dal tuo ambiente limitato.
2. **Esegui la Build:** Assicurati che il codice sia compilato (es. eseguendo `npm run build` o il comando di build specifico del framework utilizzato).
3. **Avvia il Deploy:** Esegui lo script di deploy fornito da questo plugin.
   Puoi farlo lanciando il comando dalla root del workspace del plugin, o in base alla sua disponibilità:
   ```bash
   npm run deploy
   ```
   *Nota: lo script `deploy.ts` legge le credenziali dalle impostazioni del workspace (`.vscode/settings.json`) o dalle variabili d'ambiente. Non è necessario configurarle manualmente se sono già presenti nella Settings UI dell'IDE.*
4. **Verifica il Risultato:** Alla fine del deploy, lo script restituirà in console un URL pubblico (es. `https://www.tuodominio.it/cartella-test/`). 
   Utilizza questo URL per confermare all'utente che il test è pronto o usalo in abbinamento al tuo browser subagent (se necessario) per verificare l'effettivo funzionamento del sito.

## Risoluzione dei Problemi
- Se il comando `npm run deploy` restituisce errore riguardo username o password mancanti, chiedi all'utente di configurare i parametri nella pagina Impostazioni dell'IDE sotto "Aruba Test Deploy".
- Se la cartella di build non viene trovata, assicurati di aver lanciato la build prima del deploy e che la cartella impostata (es. `out` o `dist`) sia corretta.
