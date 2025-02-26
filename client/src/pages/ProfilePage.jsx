import React, { useEffect, useState } from 'react';
import UserTrainingsTable from '../components/Training-log/UserTrainingsTable';
import TrainingGraph from '../components/DashboardPage/TrainingGraph';
import { getMockUser, fetchMockTrainings } from '../mock/mockApi';
import SpiderChart from "../components/DashboardPage/SpiderChart";
import PreviousTestingComponent from "../components/Testing-page/PreviousTestingComponent";

const ProfilePage = () => {
  const [userInfo, setUserInfo] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const [selectedSport, setSelectedSport] = useState('bike');
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Načtení uživatelských dat
    const user = getMockUser();
    if (user) {
      setUserInfo({
        name: `${user.name} ${user.surname}`,
        title: user.specialization,
        email: user.email,
        phone: user.phone,
        weight: user.weight,
        height: user.height,
        bio: user.bio,
        avatar: user.avatar || '/images/triathlete-avatar.jpg'
      });
    }

    // Načtení tréninků
    const loadTrainings = async () => {
      try {
        setLoading(true);
        const data = await fetchMockTrainings();
        setTrainings(data);
        
        // Inicializace výchozích hodnot pro graf
        if (data.length > 0) {
          const sportTrainings = data.filter(t => t.sport === selectedSport);
          const firstTitle = sportTrainings[0]?.title;
          setSelectedTitle(firstTitle);
          setSelectedTraining(sportTrainings[0]?.trainingId);
        }
      } catch (error) {
        console.error('Error loading trainings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTrainings();
  }, [selectedSport]);

  if (loading || !userInfo) return <div>Loading...</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Horní část s profilem */}
      <div className="flex gap-6 mx-auto max-w-[1600px] justify-between">
        <div className="bg-white rounded-3xl shadow-sm overflow-hidden min-w-[400px] rounded-3xl shadow-lg">
  
          <div className="h-32 bg-gradient-to-r from-purple-100 to-purple-50" />
          <div className="px-6 pb-6">
            {/* Avatar a jméno */}
            <div className="flex items-end -mt-12 mb-4">
              <div className="w-24 h-24 rounded-full border-4 border-white overflow-hidden bg-white">
                <img
                  src="/images/triathlete-avatar.jpg"
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="ml-4 mb-2">
                <h1 className="text-2xl font-bold">{userInfo.name}</h1>
                <p className="text-gray-600">{userInfo.title}</p>
              </div>
            </div>
  
            {/* Osobní informace */}
            <div className="mt-6">
              <h2 className="text-lg font-semibold mb-4">Personal Info</h2>
              <div className="grid grid-cols-1 gap-4">
                <div className="flex">
                  <p className="text-gray-600">Full Name</p>
                  <p className="font-medium">: {userInfo.name}</p>
                </div>
                <div className="flex">
                  <p className="text-gray-600">Email</p>
                  <p className="font-medium">: {userInfo.email}</p>
                </div>
                <div className="flex">
                  <p className="text-gray-600">Phone Number</p>
                  <p className="font-medium">: {userInfo.phone}</p>
                </div>
                <div className="flex">
                  <p className="text-gray-600">Weight</p>
                  <p className="font-medium">: {userInfo.weight}</p>
                </div>
                <div className="flex">
                  <p className="text-gray-600">Height</p>
                  <p className="font-medium">: {userInfo.height}</p>
                </div>
                <div className="flex">
                  <p className="text-gray-600">Bio</p>
                  <p className="font-medium">: {userInfo.bio}</p>
                </div>
              </div>
            </div>
          </div>
        
        </div>
        <SpiderChart 
            trainings={trainings}
            selectedSport={selectedSport}
          />
        <TrainingGraph 
                  trainingList={trainings}
                  selectedSport={selectedSport}
            selectedTitle={selectedTitle}
            setSelectedTitle={setSelectedTitle}
            selectedTraining={selectedTraining}
            setSelectedTraining={setSelectedTraining}
          />
      </div>
      <UserTrainingsTable />
      <PreviousTestingComponent />
    </div>
  );
};

export default ProfilePage;