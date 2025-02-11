import { mockTests } from "./tests";
import { mockTrainings } from "./trainings"
export const fetchMockTestings = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockTests);
    }, 100); // Simulace zpoždění jako u reálného API
  });
};


export const fetchMockTrainings = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockTrainings);
    }, 100); // Simulace zpoždění jako u reálného API
  });
};