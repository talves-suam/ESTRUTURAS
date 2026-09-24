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

# Segurança

- Não versione `.env.local`
- `GEMINI_API_KEY` sem prefixo `VITE_`
- Firebase: `VITE_FIREBASE_*` (opcional se `projectConfig.ts` já tiver o projeto)
- Publique as regras de `firestore.rules` (só `@unisuam.edu.br` autenticado)
- No Console: Authentication → Google ativo; domínio autorizado (localhost + site)
- Crie alerta de orçamento de **R$ 0,01** no Google Cloud Billing (banner no app aponta o link)

## Plano Spark (uso enxuto)

- Cache em localStorage; sobe ao Firestore só docs novos/mais novos
- Remove `data:` (PDF/base64) no payload da nuvem
- Teste de conexão só com leitura (sem ping de escrita)
- Contador estimado de leituras/escritas no dia + aviso perto da cota

A pasta `public/api/` (MySQL) ficou de legado e **não é usada** pelo app atual.
