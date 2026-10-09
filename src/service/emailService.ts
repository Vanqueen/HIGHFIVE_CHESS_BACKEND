import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false, // STARTTLS
  auth: {
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
  },
});

const FROM = process.env.EMAIL_FROM ?? `HIGHFIVE Chess <${process.env.SMTP_USER}>`;

export const sendPasswordResetCode = async ({ to, username, code }: { to: string; username: string; code: string }) => {
  const safeName = String(username).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Votre code de réinitialisation HIGHFIVE Chess',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:#C6963B">Réinitialisation du mot de passe</h2>
        <p>Bonjour ${safeName},</p>
        <p>Utilisez ce code pour vérifier votre adresse e-mail :</p>
        <div style="background:#f4f4f4;border-radius:8px;padding:16px;margin:16px 0;text-align:center">
          <strong style="font-size:28px;letter-spacing:6px">${code}</strong>
        </div>
        <p>Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
      </div>
    `,
  });
};

export const sendEmailChangeCode = async ({ to, username, code }: { to: string; username: string; code: string }) => {
  const safeName = String(username).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Vérification de votre nouvelle adresse e-mail HIGHFIVE Chess',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px">
        <h2 style="color:#C6963B">Vérification de votre adresse e-mail</h2>
        <p>Bonjour ${safeName},</p>
        <p>Utilisez ce code pour confirmer votre nouvelle adresse e-mail :</p>
        <div style="background:#f4f4f4;border-radius:8px;padding:16px;margin:16px 0;text-align:center">
          <strong style="font-size:28px;letter-spacing:6px">${code}</strong>
        </div>
        <p>Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
      </div>
    `,
  });
};
