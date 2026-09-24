# API MySQL — GitLab privado da instituição

1. Edite config.php (host, db, user, pass, google_client_id, install_token)
2. npm run build → pasta api/ dentro de dist/
3. Publique api/ junto do index.html no Apache
4. Rode uma vez: .../api/install.php?token=SEU_TOKEN
5. Teste: .../api/health.php
6. Login Google: Client ID OAuth (Web) no Google Cloud → google_client_id

Localhost (Vite) sem PHP: só navegador + login suam/123456.
Nunca coloque a senha MySQL no JavaScript.
