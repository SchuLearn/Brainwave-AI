// tslint:disable:no-console

import { channelNames, EEGReading, MuseClient } from './../../src/muse';

const eegData: EEGReading[] = []

let isCollectingData = false;
let collectionTimer: number | null = null;

(window as any).connect = async () => {
    const graphTitles = Array.from(document.querySelectorAll('.electrode-item h3'));
    const canvases = Array.from(document.querySelectorAll('.electrode-item canvas')) as HTMLCanvasElement[];
    const canvasCtx = canvases.map((canvas) => canvas.getContext('2d'));

    const samplesArray = new Array(90).fill({x: 0, y: 0});

    let theta = 0.0;

    const xspacing = 12; // 每个点的水平间距
    const w = 800; // 整个波形的宽度
    const dx = (2 * Math.PI / 200) * xspacing; // X增量值
    

    graphTitles.forEach((item, index) => {
        item.textContent = channelNames[index];
    });

    function calcWave(amplitude) {
        // 增加theta值
        theta += 0.04;

        const yvalues = new Array(Math.floor(w / xspacing));

        // 计算波形高度值
        let x = theta;
        for (let i = 0; i < yvalues.length; i++) {
            yvalues[i] = Math.sin(x) * amplitude;
            x += dx;
        }

        return yvalues;
    }

    function renderWave(yvalues, ctx, canvas) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height); // 绘制背景

        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        for (let x = 0; x < yvalues.length; x++) {
            ctx.beginPath();
            ctx.arc(x * xspacing, canvas.height / 2 + yvalues[x], 8, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    function plot(reading) {
        const canvas = canvases[reading.electrode];
        const context = canvasCtx[reading.electrode];  

        if (!context) {
            return;
        }
        const width = canvas.width;
        const height = canvas.height;
        context.clearRect(0, 0, width, height); // 清除整个画布

        function calculateAbsoluteAverage(samples) {
            const absoluteSum = samples.reduce((sum, value) => sum + Math.abs(value), 0);
            return absoluteSum / samples.length;
        }

        const absoluteAverage = calculateAbsoluteAverage(reading.samples);

        const yvalues = calcWave(absoluteAverage/15);

        renderWave(yvalues, context, canvas);

        // requestAnimationFrame(draw); // 重复绘制
    }



    const client = new MuseClient();

    client.connectionStatus.subscribe((status) => {
        console.log(status ? 'Connected!' : 'Disconnected');
    });

    try {
        client.enableAux = true;
        await client.connect();
        await client.start();
        document.getElementById('headset-name')!.innerText = client.deviceName;
        client.eegReadings.subscribe((reading) => {
            // console.log(reading); // 打印每个读数
            plot(reading);
            if (isCollectingData) {
                eegData.push(reading);
            }
        });
        client.telemetryData.subscribe((reading) => {
            document.getElementById('temperature')!.innerText = reading.temperature.toString() + '℃';
            document.getElementById('batteryLevel')!.innerText = reading.batteryLevel.toFixed(2) + '%';
        });
        // client.accelerometerData.subscribe((accel) => {
        //     const normalize = (v: number) => (v / 16384.).toFixed(2) + 'g';
        //     document.getElementById('accelerometer-x')!.innerText = normalize(accel.samples[2].x);
        //     document.getElementById('accelerometer-y')!.innerText = normalize(accel.samples[2].y);
        //     document.getElementById('accelerometer-z')!.innerText = normalize(accel.samples[2].z);
        // });
        await client.deviceInfo().then((deviceInfo) => {
            document.getElementById('hardware-version')!.innerText = deviceInfo.hw;
            document.getElementById('firmware-version')!.innerText = deviceInfo.fw;
        });
    } catch (err) {
        console.error('Connection failed', err);
    }
};


(window as any).startCollection = () => {

    if (isCollectingData) {
        console.log('Data collection is already in progress.');
        return;
    }

    console.log('Starting data collection.');
    eegData.length = 0;
    isCollectingData = true;

    collectionTimer = window.setTimeout(() => {
        isCollectingData = false;
        console.log('Data collection finished. Preparing to download...');
        downloadCSV();
    }, 5000)


    function convertToCSV(data) {
        let csvContent = "timestamp,electrode,sample1,sample2,sample3,sample4,sample5,sample6,sample7,sample8,sample9,sample10,sample11,sample12\n";
    
        console.log(`Converting ${data.length} data points to CSV.`);

        // 遍历 EEG 读数数组，将每个读数转换为 CSV 格式的行
        data.forEach(reading => {
            // Format the timestamp to avoid scientific notation and limit to 3 decimal places
            const formattedTimestamp = Number(reading.timestamp).toFixed(3);
            const row = `${formattedTimestamp},${reading.electrode},${reading.samples.join(",")}\n`;
            csvContent += row;
        });

        console.log(`Converting ${data.length} data points to CSV.`);
    
        return csvContent;
    }
    
      
    // function downloadCSV(): void {
    //     const csvString = convertToCSV(eegData);
    //     const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    //     const link = document.createElement('a');
    //     link.href = URL.createObjectURL(blob);
    //     link.setAttribute('download', 'eeg_data.csv');
    //     document.body.appendChild(link);
    //     link.click();
    //     document.body.removeChild(link);
    // }

    function downloadCSV(): void {
        console.log('Starting CSV download process...');
        const csvString = convertToCSV(eegData);
        
        if (csvString) {
            console.log('CSV data prepared. Downloading...');
        } else {
            console.log('CSV data is empty. No download initiated.');
        }
        
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'eeg_data.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('Download should now be in progress.');
    }

};

let isConnected = false;

// globalClient.js
const collection_client = new MuseClient(); // 同样将 client 挂载到全局 window 对象上

(window as any).Collection = async () => {

    if (!isConnected) {

        // const client = new MuseClient();
        // let isConnected = false; // 维护一个标志，表示设备是否已连接
    
        collection_client.connectionStatus.subscribe((status) => {
            console.log(status ? 'Connected!' : 'Disconnected');
            isConnected = status; // 更新连接状态
        });
    
    
        try {
            collection_client.enableAux = true;
            await collection_client.connect();
            await collection_client.start();
    
        } catch (err) {
            console.error('Connection failed', err);
        }
    }

    document.getElementById('loader').style.display = 'flex';

    // document.getElementById('headset-name')!.innerText = client.deviceName;
    collection_client.eegReadings.subscribe((reading) => {
        // console.log(reading); // 打印每个读数
        // plot(reading);
        if (isCollectingData) {
            eegData.push(reading);
        }
    });

    if (isCollectingData) {
        console.log('Data collection is already in progress.');
        return;
    }

    console.log('Starting data collection.');
    eegData.length = 0;
    isCollectingData = true;

    collectionTimer = window.setTimeout(() => {
        isCollectingData = false;
        console.log('Data collection finished. Preparing to download...');
        downloadCSV();
    }, 5000)


    function convertToCSV(data) {
        let csvContent = "timestamp,electrode,sample1,sample2,sample3,sample4,sample5,sample6,sample7,sample8,sample9,sample10,sample11,sample12\n";
    
        console.log(`Converting ${data.length} data points to CSV.`);

        // 遍历 EEG 读数数组，将每个读数转换为 CSV 格式的行
        data.forEach(reading => {
            // Format the timestamp to avoid scientific notation and limit to 3 decimal places
            const formattedTimestamp = Number(reading.timestamp).toFixed(3);
            const row = `${formattedTimestamp},${reading.electrode},${reading.samples.join(",")}\n`;
            csvContent += row;
        });

        console.log(`Converting ${data.length} data points to CSV.`);
    
        return csvContent;
    }
      
    function getPrompt(prediction) {
        let textPrompt, imagePrompt;
    
        switch (prediction) {
            case 'ANGER':
                textPrompt = "Generate a piece of philosophical text that helps calm someone feeling anger, within 100 words, using indirect language.";
                imagePrompt = "Generate an image that exudes zen and brings a sense of calm to someone feeling anger.";
                break;
            case 'HAPPINESS':
                textPrompt = "Generate a piece of philosophical text that enhances the joy for someone feeling happiness, within 100 words, using indirect language.";
                imagePrompt = "Generate a zen image that helps someone bask in their happiness and feel content.";
                break;
            case 'SADNESS':
                textPrompt = "Generate a piece of philosophical text that brings comfort to someone feeling sadness, within 100 words, using indirect language.";
                imagePrompt = "Generate an image with deep emotional resonance that brings a sense of peace to someone feeling sadness.";
                break;
            case 'FEAR':
                textPrompt = "Generate a piece of philosophical text that instills courage and calm in someone feeling fear, within 100 words, using indirect language.";
                imagePrompt = "Generate an image that inspires inner courage and helps overcome fear.";
                break;
            case 'NEUTRAL':
                textPrompt = "Generate a piece of philosophical text that provokes deep thought in someone feeling neutral, within 100 words.";
                imagePrompt = "Generate an image that reflects inner peace and tranquility for someone feeling neutral.";
                break;
            default:
                textPrompt = "Emotion unknown";
                imagePrompt = "Emotion unknown";
        }
    
        return { textPrompt, imagePrompt };
    }
    

    function downloadCSV(): void {


        console.log('Starting CSV download process...');
        const csvString = convertToCSV(eegData);

        let predictResult = "";
        
        if (csvString) {
            console.log('CSV data prepared. Downloading...');
        } else {
            console.log('CSV data is empty. No download initiated.');
        }
        
        const formData = new FormData();
        const file = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        formData.append('file', file, 'eeg_data.csv');

        let textPrompt ="";
        let imagePrompt = "";

        // 发送请求到服务器的/upload接口
        fetch('http://localhost:8000/upload', {
            method: 'POST',
            body: formData,
        })
        .then(response => response.json())
        .then(data => console.log('Success:', data))
        .catch(error => console.error('Error:', error));

        fetch('http://localhost:8000/predict', {
            method: 'POST',
        })
        .then(response => response.json())
        // .then(data => console.log('Success:', data))
        .then(data => {
            console.log('Success:', data);
            // 正确的获取预测结果的方式
            predictResult = data.prediction[0];
            console.log(predictResult); // 此处将输出 'ANGER' 或其他预测结果
            
            let prompts = getPrompt(predictResult);

            textPrompt = prompts.textPrompt;
            imagePrompt = prompts.imagePrompt;  

            console.log("Get Prompt ! ");

            fetch('http://localhost:8000/api/poem', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: textPrompt
                })
            })
            .then(response => response.json())
            .then(data => {
                console.log('Success:', data)
                const content = data.message.content;
                const imageTextElement = document.querySelector('.image-text');
                if (imageTextElement) {
                    imageTextElement.setAttribute('data-text', content);
                }
            })
            .catch(error => console.error('Error:', error));

            fetch('http://localhost:8000/api/image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: imagePrompt
                })
            })
            .then(response => response.json())
            .then(data => {
                console.log('Success:', data);
                const imageUrl = data.image_url;  // 获取API返回的图像URL
                const imageElement = document.getElementById('zenImage');
                const imageTextElement = document.querySelector('.image-text');
                
                if (imageElement) {
                    imageElement.src = imageUrl;  // 更新图像元素的src属性为新的图像URL
                }

                document.getElementById('loader').style.display = 'none';
            })
            .catch(error => console.error('Error:', error));

        })
        .catch(error => console.error('Error:', error));



    }

}

(window as any).GenerateMusic = async () => {

    if (!isConnected) {

        // const client = new MuseClient();
        // let isConnected = false; // 维护一个标志，表示设备是否已连接
    
        collection_client.connectionStatus.subscribe((status) => {
            console.log(status ? 'Connected!' : 'Disconnected');
            isConnected = status; // 更新连接状态
        });
    
    
        try {
            collection_client.enableAux = true;
            await collection_client.connect();
            await collection_client.start();
    
        } catch (err) {
            console.error('Connection failed', err);
        }
    }

    document.getElementById('loader').style.display = 'flex';

    // document.getElementById('headset-name')!.innerText = client.deviceName;
    collection_client.eegReadings.subscribe((reading) => {
        // console.log(reading); // 打印每个读数
        // plot(reading);
        if (isCollectingData) {
            eegData.push(reading);
        }
    });

    if (isCollectingData) {
        console.log('Data collection is already in progress.');
        return;
    }

    console.log('Starting data collection.');
    eegData.length = 0;
    isCollectingData = true;

    collectionTimer = window.setTimeout(() => {
        isCollectingData = false;
        console.log('Data collection finished. Preparing to download...');
        downloadMidi();
    }, 5000)


    function convertToCSV(data) {
        let csvContent = "timestamp,electrode,sample1,sample2,sample3,sample4,sample5,sample6,sample7,sample8,sample9,sample10,sample11,sample12\n";
    
        console.log(`Converting ${data.length} data points to CSV.`);

        // 遍历 EEG 读数数组，将每个读数转换为 CSV 格式的行
        data.forEach(reading => {
            // Format the timestamp to avoid scientific notation and limit to 3 decimal places
            const formattedTimestamp = Number(reading.timestamp).toFixed(3);
            const row = `${formattedTimestamp},${reading.electrode},${reading.samples.join(",")}\n`;
            csvContent += row;
        });

        console.log(`Converting ${data.length} data points to CSV.`);
    
        return csvContent;
    }

    let statusDiv = document.getElementById('status');

    function setUpdatingState(message) {
        statusDiv.innerText = message;
      }
      
    function downloadMidi(): void {


        console.log('Starting CSV download process...');
        const csvString = convertToCSV(eegData);
        
        if (csvString) {
            console.log('CSV data prepared. Downloading...');
        } else {
            console.log('CSV data is empty. No download initiated.');
        }
        
        const formData = new FormData();
        const file = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        formData.append('file', file, 'eeg_data.csv');

        const instrumentInputs = document.querySelectorAll('.textBox');
        instrumentInputs.forEach((input) => {
            console.log(input.value); // 这将打印出每个下拉框中选中的乐器名称
            formData.append(`instruments`, input.value);
        });

        // 发送请求到服务器的/upload接口
        fetch('http://localhost:8000/generate-music/', {
            method: 'POST',
            body: formData,
        })
        .then(data => {
            console.log('Successfully Generated ')
            setUpdatingState('Generated Music completed..');
            var midiPlayer = document.getElementById('player1');
            var midiVisualizer = document.getElementById('visualizer1');
            document.getElementById('loader').style.display = 'none';

            midiPlayer.src = 'generated\_music.mid';
            midiVisualizer.src = 'generated\_music.mid';
            // 重新加载当前音乐文件
            midiPlayer.load();
            midiVisualizer.load();
            midiPlayer.play();
        })
        .catch(error => console.error('Error:', error));

       
            // fetch('http://localhost:8000/api/poem', {
            //     method: 'POST',
            //     headers: {
            //         'Content-Type': 'application/json',
            //     },
            //     body: JSON.stringify({
            //         prompt: textPrompt
            //     })
            // })
            // .then(response => response.json())
            // .then(data => {
            //     console.log('Success:', data)
            //     const content = data.message.content;
            //     const imageTextElement = document.querySelector('.image-text');
            //     if (imageTextElement) {
            //         imageTextElement.setAttribute('data-text', content);
            //     }
            // })
            // .catch(error => console.error('Error:', error));

            // fetch('http://localhost:8000/api/image', {
            //     method: 'POST',
            //     headers: {
            //         'Content-Type': 'application/json',
            //     },
            //     body: JSON.stringify({
            //         prompt: imagePrompt
            //     })
            // })
            // .then(response => response.json())
            // .then(data => {
            //     console.log('Success:', data);
            //     const imageUrl = data.image_url;  // 获取API返回的图像URL
            //     const imageElement = document.getElementById('zenImage');
            //     const imageTextElement = document.querySelector('.image-text');
                
            //     if (imageElement) {
            //         imageElement.src = imageUrl;  // 更新图像元素的src属性为新的图像URL
            //     }
            // })
            // .catch(error => console.error('Error:', error));


    }

}

(window as any).GenerateVideo = async () => {

    if (!isConnected) {

        // const client = new MuseClient();
        // let isConnected = false; // 维护一个标志，表示设备是否已连接
    
        collection_client.connectionStatus.subscribe((status) => {
            console.log(status ? 'Connected!' : 'Disconnected');
            isConnected = status; // 更新连接状态
        });
    
        try {
            collection_client.enableAux = true;
            await collection_client.connect();
            await collection_client.start();
    
        } catch (err) {
            console.error('Connection failed', err);
        }
    }

    document.getElementById('loader').style.display = 'flex';

    // document.getElementById('headset-name')!.innerText = client.deviceName;
    collection_client.eegReadings.subscribe((reading) => {
        // console.log(reading); // 打印每个读数
        // plot(reading);
        if (isCollectingData) {
            eegData.push(reading);
        }
    });

    if (isCollectingData) {
        console.log('Data collection is already in progress.');
        return;
    }

    console.log('Starting data collection.');
    eegData.length = 0;
    isCollectingData = true;

    collectionTimer = window.setTimeout(() => {
        isCollectingData = false;
        console.log('Data collection finished. Preparing to download...');
        downloadCSV();
    }, 5000)


    function convertToCSV(data) {
        let csvContent = "timestamp,electrode,sample1,sample2,sample3,sample4,sample5,sample6,sample7,sample8,sample9,sample10,sample11,sample12\n";
    
        console.log(`Converting ${data.length} data points to CSV.`);

        // 遍历 EEG 读数数组，将每个读数转换为 CSV 格式的行
        data.forEach(reading => {
            // Format the timestamp to avoid scientific notation and limit to 3 decimal places
            const formattedTimestamp = Number(reading.timestamp).toFixed(3);
            const row = `${formattedTimestamp},${reading.electrode},${reading.samples.join(",")}\n`;
            csvContent += row;
        });

        console.log(`Converting ${data.length} data points to CSV.`);
    
        return csvContent;
    }
      
 
    function playVideo(prediction, nextFolder) {
        // 根据预测结果播放视频
        let videoUrl = "";
        switch (prediction) {
            case "ANGER":
                videoUrl = `http://localhost:8001/${nextFolder}/ANGER.mp4`; // 更改为ANGER视频的路径
                break;
            case "HAPPINESS":
                videoUrl = `http://localhost:8001/${nextFolder}/HAPPINESS.mp4`; // 更改为HAPPINESS视频的路径
                break;
            case "FEAR":
                videoUrl = `http://localhost:8001/${nextFolder}/FEAR.mp4`; // 更改为FEAR视频的路径
                break;
            case "SADNESS":
                videoUrl = `http://localhost:8001/${nextFolder}/SADNESS.mp4`; // 更改为SADNESS视频的路径
                break;
            default:
                console.error("Invalid emotion prediction");
                return;
        }
        document.getElementById("videoPlayer").src = videoUrl;
        document.getElementById('loader').style.display = 'none';
        document.getElementById("videoPlayer").play();
    }
    

    function downloadCSV(): void {


        console.log('Starting CSV download process...');
        const csvString = convertToCSV(eegData);

        let predictResult = "";

        // 重新生成随机数
        const randomNumber = Math.floor(Math.random() * 3) + 1; // 生成 1 到 3 之间的随机整数
        console.log(randomNumber);
        const nextFolder = `${randomNumber}`;
        
        if (csvString) {
            console.log('CSV data prepared. Downloading...');
        } else {
            console.log('CSV data is empty. No download initiated.');
        }
        
        const formData = new FormData();
        const file = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        formData.append('file', file, 'eeg_data.csv');

        let textPrompt ="";
        let imagePrompt = "";

        // 发送请求到服务器的/upload接口
        fetch('http://localhost:8000/upload', {
            method: 'POST',
            body: formData,
        })
        .then(response => response.json())
        .then(data => console.log('Success:', data))
        .catch(error => console.error('Error:', error));

        fetch('http://localhost:8000/predict', {
            method: 'POST',
        })
        .then(response => response.json())
        // .then(data => console.log('Success:', data))
        .then(data => {
            console.log('Success:', data);
            // 正确的获取预测结果的方式
            predictResult = data.prediction[0];
            console.log(predictResult); // 此处将输出 'ANGER' 或其他预测结果
            
            playVideo(predictResult, nextFolder);

        })
        .catch(error => console.error('Error:', error));


    }

}