# Regole Generali e Workflow di Test

Questo progetto utilizza un plugin personalizzato per il deploy remoto su Aruba anziché eseguire test in locale. Le seguenti regole sono FERREE e devono essere applicate ad ogni interazione.

## Regola: Workflow di Testing Obbligatorio
Quando devi verificare o testare le modifiche apportate al progetto:
- **DIVIETO ASSOLUTO DI TEST LOCALI:** Non devi MAI utilizzare `localhost` o comandi come `npm run dev` per avviare il progetto.
- **OBBLIGO DI BUILD:** Per prima cosa, assicurati sempre che il progetto compili con successo (es. `npm run build`).
- **DEVE USARE LA SKILL DI DEPLOY:** Invece di far partire il server di sviluppo, esegui il comando della skill `deploy_aruba` per caricare il risultato della build sull'ambiente di test remoto.
- **VERIFICA:** Dopo il caricamento, usa l'URL pubblico restituito dal comando per verificare che il sito funzioni correttamente. Se necessario, utilizza gli strumenti a tua disposizione per visitare l'URL.
- **ECCEZIONE:** Se lo script `deploy_aruba` segnala che il plugin è "DISABILITATO", sei esonerato da questa regola e puoi testare l'app in locale normalmente (es. `npm run dev`).

Violare questo workflow e suggerire all'utente di testare tramite localhost (quando il plugin è abilitato) contravviene alle specifiche direttive progettuali di Google Antigravity per questo workspace.
