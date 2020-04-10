import axiosClient from 'axios';

export const apiUrl = process.env.API_URL || 'http://localhost:8000';

const axios = axiosClient.create({
  baseURL: apiUrl,
  withCredentials: true
});

// add Authorization header to axios request if jwt is present in localStorage
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
})

export default axios;
