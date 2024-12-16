// src/pages/DashboardPage.js
import React from "react";
import Menu from "../components/Menu";
import { Header } from "../components/Header/Header";
import SportsSelector from "../components/Header/SportsSelector";
import TrainingTable from "../components/TrainingTable/TrainingTable";
import { TrainingStats } from "../components/Training-graph/TrainingStats";

const DashboardPage = () => {
    const loggedInUserId = "user1"; // Mockovaný přihlášený uživatel

    return (
        <div >
            <SportsSelector />
            <TrainingTable />
            <TrainingStats />
        </div>
    );
};

export default DashboardPage;
