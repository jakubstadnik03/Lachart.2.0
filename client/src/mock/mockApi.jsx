import { mockTests } from "./tests";
import { mockTrainings } from "./trainings"
import Cookies from "js-cookie";
import { mockUsers } from "./users";

// Nastavíme mockUser jako prvního trenéra z mockUsers
const mockUser = { 
  userID: "user2",  // Toto musí odpovídat _id trenéra v mockUsers
  _id: "user2",     // Přidáno pro kompatibilitu
  role: "athlete",
      name: "Petr",
      surname: "Dvořák",
      dateOfBirth: "1995-03-21",
      address: "Brno",
      email: "petr.dvorak@example.com",
      phone: "+420987654321",
      height: 175,
      weight: 70,
      sport: "cycling",
      specialization: "time trial",
      bio: "Profesionální cyklista zaměřený na časovky.",
      coachId: "coach1",
};

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
export const fetchMockTrainings = async (athleteId = null) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const user = getMockUser();
      if (!user) {
        resolve([]);
      } else {
        const filteredTrainings = mockTrainings.filter(t => 
          athleteId ? t.athleteId === athleteId : t.athleteId === user.userID
        );
        resolve(filteredTrainings);
      }
    }, 100);
  });
};

export const fetchMockTestings = async (athleteId = null) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const filteredTests = mockTests.filter(t => 
        athleteId ? t.athleteId === athleteId : true
      );
      resolve(filteredTests);
    }, 0);
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

export const fetchMockAthletes = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const user = getMockUser();
      if (!user) {
        resolve([]);
      } else if (user.role === "coach") {
        // Filtrujeme atlety z mockUsers podle coachId
        const athletes = mockUsers.filter(u => 
          u.role === "athlete" && u.coachId === user.userID
        );
        resolve(athletes);
      } else {
        resolve([]); // Pro atlety vrátí prázdné pole
      }
    }, 100);
  });
};
