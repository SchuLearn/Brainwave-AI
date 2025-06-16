# Brainwave-AI

## Project Structure

This project consists of several components structured into specific folders to maintain organized and efficient access to different parts of the project. Below is a brief description of each folder:

- **`backend/`**: Contains all backend code necessary to run server-side logic.
- **`frontend/`**: Store the frontend code, which includes user interface components, Javascript files.
- **`model_training/`**: Includes scripts and data used for training the CNN models used in the project, also contains input data and labels
- **`resource/`**: Contains video and music used in this project

## Quick Start Guide

### Requirements

- Node.js and Yarn package manager for the frontend.
- Python 3.10 for backend and model training.

### Running the Project

To try this project, you need to set up and run each part of the application. Follow the steps below to get started:

#### Setting Up the Frontend

1. **Navigate to the frontend directory:**
   ```
   cd frontend
   ```

2. **Install dependencies and build the project:**
   ```
   yarn
   ```

3. **Start the frontend server:**
   ```
   yarn start
   ```
   This will host the frontend on `http://localhost:4445`. Open this URL in a web browser to interact with the Brainwave interface.

#### Running the Backend

1. **Run the backend predictor:**
   Navigate to the `backend` directory and run:
   ```
   python predictor.py
   ```
   This starts the backend service on port `8000`.

#### Accessing Project Resources

1. **Serve the resources:**
   Move to the `resource` directory and start a simple HTTP server:
   ```
   python3 -m http.server 8001
   ```
   This command sets up the server on port `8001`, allowing you to access the resources via `http://localhost:8001`.

### Conclusion

After setting up the forntend, backend, and resource server as descibed, you can try each functions now.Each component runs on its own port, ensuring that the services do not disturb with each other.

### Tips

- By observing the signal fluctuations on the information panel, you can judge the contact condition of the device. The amplitude of the waves should not exceed 1/3 of the panel's height. Try to notice the waves jump in real-time when you blink.
- The choice of instruments in the music feature module is very important. Instruments like the violin and trumpet might produce slightly jarring sounds, but the cello and flute will be much softer. Please explore and find the instrument combinations you prefer.
