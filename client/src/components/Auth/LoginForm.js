import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const LoginForm = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    navigate("/main"); // Přesměrování na hlavní stránku
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="container mx-auto max-w-screen-xl bg-white shadow-lg rounded-lg flex flex-col lg:flex-row overflow-hidden">
        {/* Levá část */}
        <div className="hidden lg:flex bg-blue-50 w-full lg:w-1/2 items-center justify-center">
          <p className="text-3xl font-semibold text-blue-500">Welcome Back!</p>
        </div>

        {/* Pravá část */}
        <div className="w-full lg:w-1/2 p-8 lg:p-16">
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-4">
            Your Logo
          </h2>
          <h3 className="text-xl font-semibold text-gray-700 text-center mb-6">
            Sign In to your Account
          </h3>
          <p className="text-sm text-gray-500 text-center mb-8">
            Welcome back! Please enter your detail
          </p>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <div className="relative flex items-center">
                <img
                  src="/icon/mail.svg"
                  alt="Mail Icon"
                  className="w-5 h-5 absolute left-3"
                />
                <input
                  type="email"
                  className="w-full pl-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
                  placeholder="Email"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="relative flex items-center">
                <img
                  src="/icon/password.svg"
                  alt="Password Icon"
                  className="w-5 h-5 absolute left-3"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  className="w-full pl-10 pr-10 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
                  placeholder="Password"
                />
                <img
                  src={`/icon/${showPassword ? "eye-off" : "eye-on"}.svg`}
                  alt="Toggle Password Visibility"
                  className="w-5 h-5 absolute right-3 cursor-pointer"
                  onClick={togglePasswordVisibility}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 text-sm text-gray-700">Remember me</label>
              </div>
              <a href="#" className="text-sm text-blue-500 hover:underline">
                Forgot Password?
              </a>
            </div>
            <button
              type="submit"
              className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition duration-200"
            >
              Sign In
            </button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500 mb-4">Or sign in with</p>
            <div className="flex space-x-4 justify-center">
              <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
                Google
              </button>
              <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
                Facebook
              </button>
            </div>
          </div>
          <p className="mt-6 text-sm text-center text-gray-500">
            Don’t have an account?{" "}
            <a href="#" className="text-blue-500 hover:underline">
              Sign Up
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
