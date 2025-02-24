import React, { useEffect, useState } from "react";
import { fetchMockTrainings } from "../../mock/mockApi";
import TrainingItem from "./TrainingItem";

const Pagination = ({ currentPage, totalPages, onPageChange, rowsPerPage, onRowsPerPageChange, totalItems }) => {
  return (
    <nav className="flex flex-wrap justify-between items-center py-2.5 px-2">
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-700">Show</span>
        <select
          value={rowsPerPage}
          onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
          className="border rounded px-2 py-1"
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span className="text-sm text-gray-700">entries</span>
      </div>

      <div className="flex items-center gap-4">
        <p className="text-sm text-gray-700">
          Showing {(currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, totalItems)} of {totalItems} entries
        </p>
        
        <div className="flex gap-2 items-center">
          <button
            className={`px-3 py-2 rounded-full transition-all ${currentPage === 1 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-primary text-white hover:bg-blue-600'}`}
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ◀
          </button>
          {[currentPage, Math.min(currentPage + 1, totalPages)].map((page) => (
            <button
              key={page}
              className={`w-9 h-9 rounded-full text-sm font-semibold transition-all ${currentPage === page ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          ))}
          <button
            className={`px-3 py-2 rounded-full transition-all ${currentPage === totalPages ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-primary text-white hover:bg-blue-600'}`}
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            ▶
          </button>
        </div>
      </div>
    </nav>
  );
};

const UserTrainingsTable = () => {
  const [trainings, setTrainings] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "asc" });

  useEffect(() => {
    const loadTrainings = async () => {
      const data = await fetchMockTrainings();
      setTrainings(data);
    };
    loadTrainings();
  }, []);

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

  const filteredTrainings = sortedTrainings.filter((training) =>
    (training.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    training.sport?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    training.specifics?.specific?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSort = (key) => {
    setSortConfig((prevConfig) => {
      const direction = prevConfig.key === key && prevConfig.direction === "asc" ? "desc" : "asc";
      return { key, direction };
    });
  };

  const paginatedTrainings = filteredTrainings.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  if (trainings.length === 0) {
    return <div className="text-center text-lg font-semibold mt-5">Žádné tréninky k zobrazení.</div>;
  }

  return (
    <div className="training-table rounded-2xl shadow-lg mx-auto bg-white m-5 max-w-[1600px] p-4 sm:p-5">
      <div className="mb-4 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">Training Log</h2>
        <input
          type="text"
          placeholder="Find training by title"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full sm:w-1/3 p-2 border border-gray-300 rounded-2xl"
        />
      </div>

      {/* Header zarovnaný s TrainingItem */}
      <div className="hidden sm:grid grid-cols-8 bg-gray-100 p-4 border-b border-gray-300 text-sm rounded-t-2xl">
        <div className="cursor-pointer" onClick={() => handleSort("date")}>
          Date {sortConfig.key === "date" && (sortConfig.direction === "asc" ? "↑" : "↓")}
        </div>
        <div className="flex justify-center cursor-pointer" onClick={() => handleSort("sport")}>
          Sport {sortConfig.key === "sport" && (sortConfig.direction === "asc" ? "↑" : "↓")}
        </div>
        <div className="cursor-pointer" onClick={() => handleSort("title")}>
          Title {sortConfig.key === "title" && (sortConfig.direction === "asc" ? "↑" : "↓")}
        </div>
        <div className="col-span-3 text-center">Intervals</div>
        <div>Terrain</div>
        <div>Weather</div>
      </div>

      <div className="space-y-2">
        {paginatedTrainings.map((training) => (
          <TrainingItem key={training.id} training={training} />
        ))}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={Math.ceil(filteredTrainings.length / rowsPerPage)}
        onPageChange={setCurrentPage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={setRowsPerPage}
        totalItems={filteredTrainings.length}
      />
    </div>
  );
};

export default UserTrainingsTable;
