# Protections HTTP, CORS et limitation de débit

## En-têtes HTTP

Express applique Helmet à toutes les réponses HTTP. La réponse masque aussi
l’en-tête `X-Powered-By`. Les limites de taille des corps JSON et des fichiers
restent configurées dans le point d’entrée du serveur.

## CORS HTTP et Socket.IO

Les origines autorisées sont définies dans `CLIENT_ORIGINS`, une liste séparée
par des virgules contenant uniquement les origines complètes du client, sans
chemin, par exemple :

```dotenv
CLIENT_ORIGINS=https://chess.example,https://admin.example
```

En développement, l’origine par défaut est `http://localhost:5173`. En
production, aucune origine navigateur n’est autorisée si `CLIENT_ORIGINS` est
absente ou vide. L’allowlist s’applique à l’API HTTP et à Socket.IO. Les
requêtes sans en-tête `Origin` ne sont pas bloquées par CORS ; CORS n’est pas
un mécanisme d’authentification.

Les appels inter-origines avec cookies ne sont pas activés. Si l’authentification
évolue vers des cookies, il faudra concevoir explicitement les options
`credentials`, `SameSite`, `Secure` et la protection CSRF.

## Limites d’authentification

Les requêtes `/api/auth` ont un plafond global de 120 requêtes par IP sur
15 minutes, placé avant le parsing des corps. Des plafonds plus stricts
s’appliquent également par IP :

| Routes | Limite |
| --- | --- |
| `POST /login` | 10 par 15 minutes |
| `POST /register` | 5 par heure |
| `POST /refresh` | 30 par 15 minutes |
| `POST /password/forgot`, `/verify-reset-code`, `/reset` | 5 combinées par 15 minutes |
| `POST /password/change` | 10 par 15 minutes |
| `POST /unlock/:userId` | 10 par 15 minutes |

Les compteurs utilisent le stockage mémoire local d’`express-rate-limit`.
Plusieurs processus ou instances ne partagent donc pas leurs compteurs ; une
mise à l’échelle horizontale devra utiliser un store partagé. Les limites par
IP complètent les contrôles métier (verrouillage de compte, code de reset),
elles ne les remplacent pas.

## Reverse proxy

`TRUST_PROXY_HOPS` vaut zéro par défaut : Express ne fait pas confiance aux
en-têtes `X-Forwarded-*` fournis par un client. Lorsque l’API est derrière un
proxy, définir cette variable au nombre exact de proxies de confiance entre
Internet et Express, et empêcher tout accès direct au serveur applicatif qui
contournerait le proxy. Ne pas utiliser une confiance globale (`true`) sans
topologie réseau maîtrisée : l’IP dérivée sert notamment aux limites de débit.

## Fichiers liés

- Configuration : `server/src/config/http-security.config.ts`
- Middleware de limite : `server/src/middlewares/auth-rate-limit.middleware.ts`
- Routes : `server/src/routes/auth.ts`
- Démarrage HTTP : `server/src/index.ts`
- Configuration Socket.IO : `server/src/config/websocket.config.ts`
