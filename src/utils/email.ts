
export const emailValidation = (email: string) => {
  // Vérifier la validité de l'adress mail
  const regex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  return regex.test(email);
};
