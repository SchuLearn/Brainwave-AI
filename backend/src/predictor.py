import random
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse
import torch
from torchvision import transforms
import torch.nn.functional as F
import pickle
import torch.nn as nn
import pandas as pd
import numpy as np
from scipy.signal import butter, filtfilt
from scipy import signal
import logging
from fastapi.middleware.cors import CORSMiddleware
import os
from openai import OpenAI
from pydantic import BaseModel
import pandas as pd
import pretty_midi
import random
from typing import List
from fastapi.responses import FileResponse
import io
import logging

app = FastAPI()

# Allowed origins
origins = [
    "http://localhost:4445",  # Frontend server
    "http://localhost:8000/",
]

# Allow all request from origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # List of allowed origins
    allow_credentials=True,
    allow_methods=["*"],  # Allowing all methods
    allow_headers=["*"],  # Allowing all headers
)


# Set logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

"""
Define CNN network
"""
class CNNetwork(nn.Module):
    def __init__(self, input_shape=(500, 4, 5)):
        super(CNNetwork, self).__init__()

        self.conv1 = nn.Conv2d(4, 8, (3, 3))
        nn.init.kaiming_uniform_(self.conv1.weight, nonlinearity='relu')
        self.batchnorm1 = nn.BatchNorm2d(8)
        self.conv2 = nn.Conv2d(8, 16, (3, 3))
        nn.init.kaiming_uniform_(self.conv2.weight, nonlinearity='relu')
        self.batchnorm2 = nn.BatchNorm2d(16)

        conv_output_shape = self._get_conv_output(input_shape)
        flattened_dim = conv_output_shape[0] * conv_output_shape[1] * conv_output_shape[2]

        self.fc1 = nn.Linear(flattened_dim, 128)
        self.fc2 = nn.Linear(128, 32)
        self.fc3 = nn.Linear(32, 4)

        self.dropout = nn.Dropout(0.5)

    def _get_conv_output(self, shape):
        with torch.no_grad():
            x = torch.rand(1, shape[1], shape[0], shape[2])
            x = F.relu(self.conv1(x), inplace=True)
            x = F.relu(self.conv2(x), inplace=True)
        return x.size()[1:]

    def forward(self, x):
        x = x.permute(0, 2, 1, 3)  # adjust input tensor to (batch_size, number of electrode, timestamps, types of brainwave)
        x = F.leaky_relu(self.conv1(x))
        x = self.batchnorm1(x)
        x = F.leaky_relu(self.conv2(x))
        x = self.batchnorm2(x)

        x = x.view(x.size(0), -1)  # flatten

        x = F.leaky_relu(self.fc1(x))
        x = self.dropout(x)
        x = F.leaky_relu(self.fc2(x))
        x = self.dropout(x)
        x = self.fc3(x)
        x = x.squeeze(1)  # remove redundant dimension

        return x


try:
    model_path = '../resource/net.pth'
    model = CNNetwork()
    model.load_state_dict(torch.load(model_path))
    model.eval()

    with open('../resource/label_encoder.pkl', 'rb') as file:
        label_encoder = pickle.load(file)
except Exception as e:
    logger.error(f"load model or label encoder failed: {e}")
    raise HTTPException(status_code=500, detail="load model or label_encoder failed")


"""
This function is for data reconstruction
"""
def data_reconstructed(data):
    reconstructed_data = pd.DataFrame(columns=['timestamp', 'electrode_0', 'electrode_1', 'electrode_2', 'electrode_3'])

    timestamps = np.arange(0, 46.875, 3.90625)
    timestamps_df = pd.DataFrame(timestamps, columns=['timestamp'])

    # read 4 rows data for each time
    chunk_size = 4
    for start in range(0, len(data), chunk_size):

        # Calculate end index
        end = min(start + chunk_size, len(data))

        # Is current chunk size is not expected, jump
        if end - start != chunk_size:
            continue

        chunk = data[start:start + chunk_size]
        time = chunk.iloc[0, 0]

        # Create new dataframe to save new data
        electrodes_data = pd.DataFrame()

        # Traverse each row
        for i in range(chunk_size):
            electrode_data = chunk.iloc[i, 2:].reset_index(drop=True)
            electrodes_data[f'electrode_{i}'] = electrode_data

        timestamps = np.arange(0, 46.875, 3.90625) + time
        timestamps_df = pd.DataFrame(timestamps, columns=['timestamp'])

        constructed_chunk = pd.concat([timestamps_df, electrodes_data.reset_index(drop=True)], axis=1)
        reconstructed_data = pd.concat([reconstructed_data, constructed_chunk], ignore_index=True)
    print('reconstructing success')
    return reconstructed_data


def bandpass_filter(data, lowcut, highcut, fs, order=5):
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    b, a = butter(order, [low, high], btype='band')
    y = filtfilt(b, a, data)
    return y


def data_filtering(data):
    # Brainwave frequency range
    bands = {
        'Delta': (0.5, 4),
        'Theta': (4, 8),
        'Alpha': (8, 12),
        'Beta': (12, 30),
        'Gamma': (30, 45)
    }

    # Sampling frequency
    fs = 256

    # Create Dataframe for result
    result_df = pd.DataFrame(data['timestamp'])

    electrode_names = ['TP9', 'AF7', 'AF8', 'TP10']  # 对应于电极0, 1, 2, 3

    # Tranverse
    for band_name, (low, high) in bands.items():
        for idx, electrode in enumerate(['electrode_0', 'electrode_1', 'electrode_2', 'electrode_3']):
            # Apply band-pass filter
            filtered_data = bandpass_filter(data[electrode].values, low, high, fs)

            # Add result
            result_df[f'{band_name}_{electrode_names[idx]}'] = filtered_data

    # Reorder columns
    ordered_columns = ['timestamp'] + [f"{band}_{electrode}" for band in bands for electrode in electrode_names]
    result_df = result_df[ordered_columns]

    print('filtering success')
    return result_df


def normalize_columns(data):
    # Ensure the column number can be divided by 4
    num_samples, num_features = data.shape
    assert num_features % 4 == 0, "The number of features must be a multiple of 4."

    normalized_data = np.zeros_like(data)

    for i in range(0, num_features, 4):
        # Read 4 columns at one time
        group_data = data[:, i:i + 4]

        # normalize to 0-1
        min_val = np.min(group_data)
        max_val = np.max(group_data)
        group_normalized = (group_data - min_val) / (max_val - min_val) if max_val > min_val else np.zeros_like(
            group_data)

        # adjust data with mean of 1
        mean_val = np.mean(group_normalized)
        if mean_val != 0:
            group_normalized *= (1 / mean_val)
        else:
            print(f"Group starting at column {i + 1} has zero variance; normalization skipped.")

        # Integrate normalized data
        normalized_data[:, i:i + 4] = group_normalized

    return normalized_data

"""
EEG signal preprocessing
"""


def preprocessing_eeg(eeg_signal, target_shape):
    # 1.resampling
    resampling = resampling_eeg(eeg_signal, target_shape)

    print(resampling.shape)
    print('resampling success')

    # 2. normalizing
    normalize = normalize_columns(resampling)

    # 3.filtering
    baseline = baseline_correction(normalize, 500)

    print('baseline success')

    # 4. reshaping
    reshaped = reshaped_eeg(baseline, [500, 4, 5])

    print('reshape success')

    return reshaped


"""
EEG signal reshaping
"""
def reshaped_eeg(eeg_signal, target_shape):
    reshaped_eeg = eeg_signal.reshape(target_shape)

    return reshaped_eeg


"""
EEG signal resampling
"""
def resampling_eeg(eeg_signal, target_shape):
    eeg_signal = np.array(eeg_signal)
    timestamps = target_shape[0]
    print(eeg_signal.shape)
    resampled_signal = signal.resample(eeg_signal[:, 1:21], timestamps)

    return resampled_signal


"""
EEG signal baseline_correction
"""
def baseline_correction(data, fs, baseline_duration=0.2):
    baseline_samples = int(fs * baseline_duration)
    baseline = np.mean(data[:, :baseline_samples], axis=1, keepdims=True)
    data = data - baseline
    return data

def save_data_to_csv(data, file_path):
    # Assuming data is in a format that can be handled by np.savetxt (e.g., numpy array)
    np.savetxt(file_path, data, delimiter=',', fmt='%f')  # Adjust the format as necessary

@app.post("/predict/")
async def predict():
    try:

        # Read data from default path
        file_path = '../OUTPUT/5s_reading.csv'
        data = pd.read_csv(file_path)

        # Data preprocessing
        reconstructed_data = data_reconstructed(data)
        filtered_data = data_filtering(reconstructed_data)

        processed_data = preprocessing_eeg(filtered_data, [500, 4, 5])

        print('preprocessing success')
        print(processed_data.shape)

        # Ensure torch with correct shape

        processed_data = torch.from_numpy(processed_data).float()
        data_tensor = processed_data.unsqueeze(0)

        print("Shape:", data_tensor.shape)

        # Model prediction
        prediction = model(data_tensor)

        prediction_cpu = prediction.cpu()
        predicted_labels = prediction_cpu.argmax(dim=1).numpy()  # Get category and convert to numpy

        # label_encoder for result decoding
        decoded_prediction = label_encoder.inverse_transform(predicted_labels)

        print('prediction success')
        print("Decoded prediction:", decoded_prediction)

        return JSONResponse(content={"prediction": decoded_prediction.tolist()})

    except Exception as e:
        logger.error(f"Processing prediction request failed: {e}")
        return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


# Default path
UPLOAD_FOLDER = '../OUTPUT'


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        csv_data = contents.decode('utf-8')

        # construct path
        file_path = os.path.join(UPLOAD_FOLDER, f"5s_reading.csv")

        # Save csv file
        with open(file_path, 'w') as f:
            f.write(csv_data)

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

    return JSONResponse(content={"message": "CSV file uploaded and saved successfully"}, status_code=200)

MidPath = '../../frontend/demo/dist'

"""
This endpoint is used to save generated midi file locally.
"""
@app.post("/uploadMid")
async def upload_file(file: UploadFile = File(...)):
    try:
        contents = await file.read()

        # Construct file path
        file_path = os.path.join(MidPath, file.filename)

        # Save midi file
        with open(file_path, 'wb') as f:
            f.write(contents)

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

    return JSONResponse(content={"message": "MIDI file uploaded and saved successfully"}, status_code=200)


openai_api_key = os.getenv("OPENAI_API_KEY")

if openai_api_key is None:
    raise ValueError("OPENAI_API_KEY environment variable is not set")

client = OpenAI(api_key=openai_api_key)

# Define request class
class PoemRequest(BaseModel):
    prompt: str

"""
Endpoint for text generation, asset role of AI here
"""
@app.post("/api/poem")
async def generate_poem(request: PoemRequest):
    try:
        completion = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system",
                 "content": "You are a poetic assistant, skilled in explaining complex concepts with creative talent."},
                {"role": "user", "content": request.prompt}
            ]
        )

        return {"message": completion.choices[0].message}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

"""
Endpoint for image generation
"""
@app.post("/api/image")
async def generate_image(request: PoemRequest):
    try:
        response = client.images.generate(
            model="dall-e-3",
            prompt=request.prompt,  # dynamic prompt
            size="1024x1024",
            quality="standard",
            n=1
        )
        return {"image_url": response.data[0].url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Scale eeg signal
def scale_eeg(value, min_eeg, max_eeg):
    return int((value - min_eeg) / (max_eeg - min_eeg) * 74) + 36

@app.post("/generate-music/")
async def generate_music(file: UploadFile = File(...), instruments: List[str] = Form(...)):
    csv_data = await file.read()
    data = pd.read_csv(io.StringIO(csv_data.decode('utf-8')))
    reconstructed_data = pd.DataFrame(columns=['timestamp', 'electrode_0', 'electrode_1', 'electrode_2', 'electrode_3'])

    note_lengths = {
        'quarter': 0.5,
        'DottedQ': 0.75,
        'eighth': 0.25,
        'half': 1.0,
        'DottedH': 1.5,
        'whole': 2.0
    }

    weights = [50, 40, 10, 20, 5, 2]

    # read 4 rows data for each time
    chunk_size = 4
    for start in range(0, len(data), chunk_size):
        # Calculate end index
        end = min(start + chunk_size, len(data))

        # if current chunk size is not equal to default, jump it
        if end - start != chunk_size:
            continue

        chunk = data[start:start + chunk_size]

        # Create Dataframe for electrode data
        electrodes_data = pd.DataFrame()

        # Traverse
        for i in range(chunk_size):
            electrode_data = chunk.iloc[i, 2:].reset_index(drop=True)
            electrodes_data[f'electrode_{i}'] = electrode_data

        reconstructed_data = reconstructed_data.dropna(how='all')
        electrodes_data = electrodes_data.dropna(how='all')

        dataframe = pd.concat([reconstructed_data, electrodes_data], ignore_index=True)

    # Preprocessing
    min_eeg = dataframe.min().min()
    max_eeg = dataframe.max().max()

    midi_file = pretty_midi.PrettyMIDI()
    instrument_objects = []
    for instrument_name in instruments:
        instrument_program = pretty_midi.instrument_name_to_program(instrument_name)
        instrument_objects.append(pretty_midi.Instrument(program=instrument_program))

    total_duration = 30  # Total duration is 30 sec

    for ch, instrument in enumerate(instrument_objects):
        note_start = 0
        row_index = 0
        while note_start < total_duration:
            if row_index >= len(dataframe):
                row_index = 0
            row = dataframe.iloc[row_index]
            # note_type, note_duration = random.choice(list(note_lengths.items()))
            note_type, note_duration = random.choices(list(note_lengths.items()), weights=weights, k=1)[0]
            note_number = scale_eeg(row[f'electrode_{ch}'], min_eeg, max_eeg)

            note_end = note_start + note_duration
            note = pretty_midi.Note(velocity=100, pitch=note_number, start=note_start, end=note_end)
            instrument.notes.append(note)
            note_start = note_end
            row_index += 1

        midi_file.instruments.append(instrument)

    output_path = '../../frontend/demo/dist/generated_music.mid'
    midi_file.write(output_path)
    return FileResponse(output_path, media_type="audio/midi", filename="generated_music.mid")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
