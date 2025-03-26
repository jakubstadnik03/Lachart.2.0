"use client";
import React from 'react';
import { useRouter } from 'next/navigation';

const LogoutButton = () => {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      // Volání API pro odhlášení (pokud existuje)
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
    } catch (error) {
      console.error('Chyba při odhlašování:', error);
    } finally {
      // Vyčištění lokálního úložiště
      localStorage.removeItem('token');
      // Přesměrování na přihlašovací stránku
      router.push('/login');
    }
  };

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
    >
      Log out
    </button>
  );
};

export default LogoutButton; 