/* ------------------------------------------------------------------ */
/*  Configuration centrale de l'authentification.                      */
/*  Le jeton est transporté par un cookie httpOnly : jamais lisible    */
/*  par le JavaScript de la page, donc non exfiltrable via XSS.        */
/*                                                                     */
/*  Tout est lu à l'appel, pas à l'import : en ESM les imports sont    */
/*  évalués avant les dotenv.config() de server.js, donc figer les     */
/*  valeurs ici donnerait une config vide selon l'ordre des imports.   */
/* ------------------------------------------------------------------ */

/* Durée de vie de la session (7 jours). */
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export const getCookieName = () => process.env.AUTH_COOKIE_NAME || 'vipp_session';

export const getCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';

  /* En dev, front (5173) et API (5001) partagent le site « localhost » :
     SameSite=Lax suffit. En production, si l'API est sur un autre domaine
     que le front, il faut SameSite=None + Secure — d'où les surcharges. */
  const sameSite = (process.env.AUTH_COOKIE_SAMESITE || (isProd ? 'none' : 'lax')).toLowerCase();
  const secure = process.env.AUTH_COOKIE_SECURE
    ? process.env.AUTH_COOKIE_SECURE === 'true'
    : sameSite === 'none' || isProd;

  return {
    httpOnly: true,
    sameSite,
    secure,
    path: '/',
    maxAge: TOKEN_TTL_SECONDS * 1000,
    ...(process.env.AUTH_COOKIE_DOMAIN ? { domain: process.env.AUTH_COOKIE_DOMAIN } : {}),
  };
};

/* La suppression doit reprendre les mêmes attributs que la création,
   sinon le navigateur ne reconnaît pas le cookie à effacer. */
export const getClearCookieOptions = () => {
  const { maxAge, ...rest } = getCookieOptions();
  return rest;
};

export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw Object.assign(
      new Error(
        'JWT_SECRET manquant ou trop court (32 caractères minimum). ' +
          'Ajoutez-le dans .env.development / .env.production.'
      ),
      { status: 500 }
    );
  }
  return secret;
};
