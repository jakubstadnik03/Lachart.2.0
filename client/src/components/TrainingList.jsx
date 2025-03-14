import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthProvider';
import { API_ENDPOINTS } from '../config/api.config';

const TrainingList = () => {
    const [trainings, setTrainings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { token } = useAuth();

    useEffect(() => {
        const fetchTrainings = async () => {
            try {
                const response = await fetch(API_ENDPOINTS.TRAININGS, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error('Nepodařilo se načíst tréninky');
                }

                const data = await response.json();
                setTrainings(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchTrainings();
    }, [token]);

    // ... zbytek komponenty ...
}; 