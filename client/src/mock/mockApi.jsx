import { mockTests } from "./tests";
import { mockTrainings } from "./trainings"
import Cookies from "js-cookie";
import { mockUsers } from "./users";

// Výchozí mockUser
const defaultMockUser = { 
  userID: "user2",
  _id: "user2",
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

// Uloží uživatele do cookies
export const setMockUser = () => {
  Cookies.set("user", JSON.stringify(defaultMockUser), { expires: 7 });
};

// Získá přihlášeného uživatele nebo vrátí výchozího
export const getMockUser = () => {
  const userCookie = Cookies.get("user");
  if (!userCookie) {
    // Pokud není uživatel v cookies, nastavíme výchozího
    setMockUser();
    return defaultMockUser;
  }
  return JSON.parse(userCookie);
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

// Získá všechny testy
export const getMockTests = () => {
  const user = getMockUser();
  if (!user) return [];
  
  // Pro trenéra vrátíme testy všech jeho atletů
  if (user.role === "coach") {
    const athleteIds = mockUsers
      .filter(u => u.role === "athlete" && u.coachId === user.userID)
      .map(a => a.userID);
    return mockTests.filter(test => athleteIds.includes(test.athleteId));
  }
  
  // Pro atleta vrátíme jen jeho testy
  return mockTests.filter(test => test.athleteId === user.userID);
};

// Získá konkrétní test podle ID
export const getMockTest = (testId) => {
  return mockTests.find(test => test.id === testId);
};

// Přidá nový test
export const addMockTest = (newTest) => {
  const user = getMockUser();
  if (!user) return null;

  const test = {
    ...newTest,
    id: `test${mockTests.length + 1}`,
    athleteId: user.userID,
    date: new Date().toISOString(),
  };
  
  mockTests.push(test);
  return test;
};
