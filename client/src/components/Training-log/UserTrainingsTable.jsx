import React, { useEffect, useState } from "react";
import { fetchMockTrainings } from "../../mock/mockApi";
import TrainingItem from "./TrainingItem";

const UserTrainingsTable = () => {
  const [trainings, setTrainings] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "asc" });
  const rowsPerPage = 5;

  useEffect(() => {
    const loadTrainings = async () => {
      const data = await fetchMockTrainings();
      setTrainings(data);
    };
    loadTrainings();
  }, []);

  // Funkce pro řazení dat
  const sortData = (trainings, config) => {
    return [...trainings].sort((a, b) => {
      const aValue = a[config.key] ?? "";
      const bValue = b[config.key] ?? "";
      
      if (aValue < bValue) return config.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return config.direction === "asc" ? 1 : -1;
      return 0;
    });
  };

  const sortedTrainings = sortData(trainings, sortConfig);

  // Funkce pro filtrování podle title, sportu a specifik
  const filteredTrainings = sortedTrainings.filter((training) =>
    (training.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    training.sport?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    training.specifics?.specific?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Řazení při kliknutí na hlavičku
  const handleSort = (key) => {
    setSortConfig((prevConfig) => {
      const direction = prevConfig.key === key && prevConfig.direction === "asc" ? "desc" : "asc";
      return { key, direction };
    });
  };

  // Změna stránky
  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  // Stránkování dat
  const paginatedTrainings = filteredTrainings.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  if (trainings.length === 0) {
    return <div className="text-center text-lg font-semibold mt-5">Žádné tréninky k zobrazení.</div>;
  }

  return (
    <div className="training-table rounded-2xl shadow-lg p-5 bg-white">
      {/* Vyhledávací pole */}
      <div className="mb-4 flex justify-between items-center">
        <input
          type="text"
          placeholder="Hledat tréninky..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-1/3 p-2 border border-gray-300 rounded-md"
        />
      </div>

      {/* Hlavička tabulky */}
      <div className="grid grid-cols-11 bg-gray-100 font-semibold p-2 border-b border-gray-300 text-sm">
        <div className="cursor-pointer" onClick={() => handleSort("date")}>
          Datum {sortConfig.key === "date" && (sortConfig.direction === "asc" ? "↑" : "↓")}
        </div>
        <div className="cursor-pointer" onClick={() => handleSort("sport")}>
          Sport {sortConfig.key === "sport" && (sortConfig.direction === "asc" ? "↑" : "↓")}
        </div>
        <div className="cursor-pointer" onClick={() => handleSort("title")}>
          Název {sortConfig.key === "title" && (sortConfig.direction === "asc" ? "↑" : "↓")}
        </div>
        <div>Interval</div>
        <div>Power/Pace</div>
        <div>Heart Rate</div>
        <div>RPE</div>
        <div>Lactate</div>
        <div>Terrain</div>
        <div>Specifika</div>
        <div>Popis</div>
      </div>

      {/* Řádky tabulky */}
      {paginatedTrainings.map((training) => (
        <TrainingItem key={training.id} training={training} />
      ))}

      {/* Stránkování */}
      <div className="flex justify-center mt-4 space-x-4">
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded-md"
          onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
          disabled={currentPage === 1}
        >
          Předchozí
        </button>
        <span className="px-4 py-2 text-lg font-semibold">
          {currentPage} / {Math.ceil(filteredTrainings.length / rowsPerPage)}
        </span>
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded-md"
          onClick={() => handlePageChange(Math.min(currentPage + 1, Math.ceil(filteredTrainings.length / rowsPerPage)))}
          disabled={currentPage >= Math.ceil(filteredTrainings.length / rowsPerPage)}
        >
          Další
        </button>
      </div>
    </div>
  );
};

export default UserTrainingsTable;
