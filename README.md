# Estruturas Curriculares UNISUAM

Aplicação React (Vite) para cadastro e emissão de estruturas disciplinares/modulares.

## Desenvolvimento local

1. `npm install`
2. Copie `.env.example` → `.env.local` e preencha se for usar Firebase
3. `npm run dev` → http://localhost:3000

## Publicar no servidor (Apache / pasta `public/estruturas`)

O servidor da UNISUAM costuma exigir **arquivo index na raiz** da pasta. O build gera isso.

1. Na pasta `public/estruturas`:
   ```bash
   npm install
   npm run build
   ```
2. O resultado fica em `dist/`, contendo:
   - `index.php` — entrada PHP (compatível com o padrão das outras apps)
   - `index.html` — SPA
   - `assets/` — JS/CSS
   - `.htaccess` — serve estáticos sem passar pelo router PHP das apps vizinhas
3. Envie **todo o conteúdo de `dist/`** para a pasta `estruturas` no servidor (substituindo os arquivos de publicação; não precisa enviar `src/` nem `node_modules/`).

URL esperada: `.../estruturas/` (ou `.../estruturas/index.php`).

### Conferir antes de subir

```bash
npm run build
npm run preview
```

Abra http://localhost:3000 e valide a matriz / mapa / exportações.

## Segurança

- Não versione `.env.local`
- `GEMINI_API_KEY` sem prefixo `VITE_`
- Firebase só com `VITE_FIREBASE_*` e restrição por domínio no Console
- Firestore bloqueado por padrão nas rules até haver autenticação
