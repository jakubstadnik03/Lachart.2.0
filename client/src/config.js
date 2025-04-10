const config = {
  development: {
    apiUrl: 'http://localhost:8000'
  },
  production: {
    apiUrl: 'https://lachart.onrender.com'
  }
};

// Determine which environment we're in
const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development';

// Export the appropriate configuration
export default config[environment]; 