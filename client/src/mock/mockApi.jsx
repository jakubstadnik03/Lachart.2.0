import { mockTests } from "./tests";
import { mockTrainings } from "./trainings"
import Cookies from "js-cookie";

const mockUser = { userID: "user2", name: "Mock User" };

// Uloží uživatele do cookies (simuluje přihlášení)
export const setMockUser = () => {
  Cookies.set("user", JSON.stringify(mockUser), { expires: 7 });
};

// Získá přihlášeného uživatele
export const getMockUser = () => {
  const userCookie = Cookies.get("user");
  return userCookie ? JSON.parse(userCookie) : null;
};

// Získá tréninky pouze pro přihlášeného uživatele
export const fetchMockTrainings = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const user = getMockUser();
      if (!user) {
        resolve([]); // Pokud není uživatel přihlášený, vrátíme prázdné pole
      } else {
        resolve(mockTrainings.filter(t => t.athleteId === user.userID));      
      }
    }, 100);
  });
};

export const fetchMockTestings = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockTests);
    }, 100); // Simulace zpoždění jako u reálného API
  });
};

export const fetchTrainingTitles = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const user = getMockUser();
      if (!user) {
        resolve([]);
      } else {
        const titles = [...new Set(mockTrainings.filter((t) => t.athleteId === user.userID).map((t) => t.title))];
        
        resolve(titles);
      }
    }, 100);
  });
};


export const fetchMockTraining = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockTrainings);
    }, 100); // Simulace zpoždění jako u reálného API
  });
};
export const fetchUserTrainings = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const user = getMockUser();
      if (!user) {
        resolve([]);
      } else {
        resolve(mockTrainings.filter((t) => t.athleteId === user.userID));
      }
    }, 100);
  });
};
