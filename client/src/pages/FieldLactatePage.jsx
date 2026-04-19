import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

/**
 * Starší URL; obsah je v {@link ../pages/TrainingPage.jsx} (kotva #field-lactate).
 */
export default function FieldLactatePage() {
  const { athleteId } = useParams();
  if (athleteId) {
    return <Navigate to={`/training/${athleteId}#field-lactate`} replace />;
  }
  return <Navigate to="/training#field-lactate" replace />;
}
