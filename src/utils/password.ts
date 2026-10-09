import argon2 from "argon2"

export const hashPassword = async (password: string) => {
  try {
    const hashedPassword = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    return hashedPassword;
  } catch (error) {
    console.error("Erreur lors du hachage du mot de passe:", error);
    throw error;
  }
};

export const verifyPassword = async (hashedPassword: string, plainPassword: string) => {
  try {
    const isMatch = await argon2.verify(hashedPassword, plainPassword);
    return isMatch;
  } catch (error) {
    console.error("Erreur lors de la vérification du mot de passe:", error);
    throw new Error("Erreur de vérification du mot de passe");
  }
};

export const passwordValidation = (password: string) => {
  // Vérification simple : longueur minimale de 8 caractères, au moins une lettre majuscule, une lettre minuscule et un chiffre
  const regex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/;
  return regex.test(password);
};

export const generateRandomPassword = () => {
  const length = 12;
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+[]{}|;:,.<>?";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
};

