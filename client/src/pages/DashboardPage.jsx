// src/pages/DashboardPage.js
import React from "react";
import SportsSelector from "../components/Header/SportsSelector";
import TrainingTable from "../components/TrainingTable/TrainingTable";
import { TrainingStats } from "../components/Training-graph/TrainingStats";
import TrainingGraph from "../components/DashboardPage/TrainingGraph";

const DashboardPage = () => {
    const loggedInUserId = "user1"; // Mockovaný přihlášený uživatel

    return (
        <div >
            <SportsSelector />
            <TrainingTable />
            <TrainingStats />
            <TrainingGraph  trainingId={"training4"}/>
        </div>
    );
};

export default DashboardPage;
