import React, { useEffect, useState } from 'react';
import UserTrainingsTable from '../components/Training-log/UserTrainingsTable';
import TrainingGraph from '../components/DashboardPage/TrainingGraph';
import { getMockUser, fetchMockTrainings } from '../mock/mockApi';
import SpiderChart from "../components/DashboardPage/SpiderChart";
import PreviousTestingComponent from "../components/Testing-page/PreviousTestingComponent";
import SportsSelector from "../components/Header/SportsSelector";

const ProfilePage = () => {
  const [userInfo, setUserInfo] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const [selectedSport, setSelectedSport] = useState('bike');
  const [selectedTestingSport, setSelectedTestingSport] = useState('all');
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
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-[1600px] mx-auto">
      {/* Horní část s profilem */}
      <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
        <div className="h-24 md:h-32 bg-gradient-to-r from-purple-100 to-purple-50" />
        <div className="px-4 md:px-6 pb-4 md:pb-6">
          {/* Avatar a jméno */}
          <div className="flex flex-col sm:flex-row sm:items-end -mt-12 mb-4 gap-4 sm:gap-0">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full border-4 border-white overflow-hidden bg-white mx-auto sm:mx-0">
              <img
                src={userInfo.avatar}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-center sm:text-left sm:ml-4 sm:mb-2">
              <h1 className="text-xl md:text-2xl font-bold">{userInfo.name}</h1>
              <p className="text-gray-600">{userInfo.title}</p>
            </div>
          </div>

          {/* Osobní informace */}
          <div className="mt-4 md:mt-6">
            <h2 className="text-lg font-semibold mb-3 md:mb-4">Personal Info</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              {[
                { label: 'Full Name', value: userInfo.name },
                { label: 'Email', value: userInfo.email },
                { label: 'Phone Number', value: userInfo.phone },
                { label: 'Weight', value: userInfo.weight },
                { label: 'Height', value: userInfo.height },
                { label: 'Bio', value: userInfo.bio },
              ].map((item, index) => (
                <div key={index} className="flex flex-col sm:flex-row sm:items-center p-2 bg-gray-50 rounded-lg">
                  <p className="text-gray-600 text-sm sm:w-1/3">{item.label}</p>
                  <p className="font-medium text-sm sm:w-2/3">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Spodní část s grafy a tabulkou */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <SpiderChart 
          trainings={trainings}
          selectedSport={selectedSport}
          className="w-[400px]"
        />
        <TrainingGraph 
          trainingList={trainings}
          selectedSport={selectedSport}
          selectedTitle={selectedTitle}
          setSelectedTitle={setSelectedTitle}
          selectedTraining={selectedTraining}
          setSelectedTraining={setSelectedTraining}
        />

        <div className='lg:col-span-2'>
          <UserTrainingsTable trainings={trainings} />
        </div>
      </div>

      {/* Previous Testing Component s vlastním výběrem sportu */}
      <div className="lg:col-span-2">
        <div className="mb-4">
          <SportsSelector onSportChange={setSelectedTestingSport} />
        </div>
        <PreviousTestingComponent selectedSport={selectedTestingSport} />
      </div>
    </div>
  );
};

export default ProfilePage;