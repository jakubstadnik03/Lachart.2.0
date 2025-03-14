import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthProvider';
import { API_ENDPOINTS } from '../config/api.config';

const TestingList = () => {
    const [testings, setTestings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { token } = useAuth();

    useEffect(() => {
        const fetchTestings = async () => {
            try {
                const response = await fetch(API_ENDPOINTS.TESTINGS, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error('Nepodařilo se načíst testování');
                }

                const data = await response.json();
                setTestings(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchTestings();
    }, [token]);

    // ... zbytek komponenty ...
}; 