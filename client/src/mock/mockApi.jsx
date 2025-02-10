import { mockTests } from "./tests";

export const fetchMockTrainings = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockTests);
    }, 500); // Simulace zpoždění jako u reálného API
  });
};
