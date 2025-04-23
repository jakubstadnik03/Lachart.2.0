import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthProvider';
import { GoogleLogin } from '@react-oauth/google';
import FacebookLogin from 'react-facebook-login';
import { useNotification } from '../context/NotificationContext';
import { API_ENDPOINTS } from '../config/api.config';

const SettingsPage = () => {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const [linkedAccounts, setLinkedAccounts] = useState({
    google: false,
    facebook: false
  });

  useEffect(() => {
    // Check which social accounts are linked
    if (user) {
      setLinkedAccounts({
        google: !!user.googleId,
        facebook: !!user.facebookId
      });
    }
  }, [user]);

  const handleGoogleSuccess = async (response) => {
    try {
      const res = await fetch(`${API_ENDPOINTS.AUTH}/link-social`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          provider: 'google',
          providerId: response.credential
        }),
      });

      if (res.ok) {
        setLinkedAccounts(prev => ({ ...prev, google: true }));
        addNotification('Google account linked successfully', 'success');
      } else {
        addNotification('Failed to link Google account', 'error');
      }
    } catch (error) {
      console.error('Link Google error:', error);
      addNotification('Failed to link Google account', 'error');
    }
  };

  const handleFacebookSuccess = async (response) => {
    try {
      const res = await fetch(`${API_ENDPOINTS.AUTH}/link-social`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          provider: 'facebook',
          providerId: response.id
        }),
      });

      if (res.ok) {
        setLinkedAccounts(prev => ({ ...prev, facebook: true }));
        addNotification('Facebook account linked successfully', 'success');
      } else {
        addNotification('Failed to link Facebook account', 'error');
      }
    } catch (error) {
      console.error('Link Facebook error:', error);
      addNotification('Failed to link Facebook account', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
      <div className="relative py-3 sm:max-w-xl sm:mx-auto">
        <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
          <div className="max-w-md mx-auto">
            <div className="divide-y divide-gray-200">
              <div className="py-8 text-base leading-6 space-y-4 text-gray-700 sm:text-lg sm:leading-7">
                <h2 className="text-2xl font-bold mb-6">Account Settings</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium mb-2">Linked Social Accounts</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <img src="/icon/google.svg" alt="Google" className="h-6 w-6 mr-2" />
                          <span>Google</span>
                        </div>
                        {linkedAccounts.google ? (
                          <span className="text-green-500">Connected</span>
                        ) : (
                          <GoogleLogin
                            onSuccess={handleGoogleSuccess}
                            onError={() => addNotification('Google authentication failed', 'error')}
                            useOneTap={false}
                            width="200"
                            theme="outline"
                            size="large"
                            text="signin_with"
                            shape="rectangular"
                          />
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <img src="/icon/facebook.svg" alt="Facebook" className="h-6 w-6 mr-2" />
                          <span>Facebook</span>
                        </div>
                        {linkedAccounts.facebook ? (
                          <span className="text-green-500">Connected</span>
                        ) : (
                          <FacebookLogin
                            appId={process.env.REACT_APP_FACEBOOK_APP_ID}
                            autoLoad={false}
                            fields="name,email,picture"
                            callback={handleFacebookSuccess}
                            cssClass="inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                            icon="fa-facebook"
                            textButton="Connect"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;