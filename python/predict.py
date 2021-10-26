import joblib
import numpy as np
from binance import Client
from sklearn.preprocessing import StandardScaler

api = {
    "pair": "BNBUSDT",
    "data_time": "10 minute UTC",
}

# client for binance api
client = Client()

data_time = api["data_time"]
pair = api["pair"]
k_lines = client.get_historical_klines(pair, Client.KLINE_INTERVAL_1MINUTE, data_time)
k_lines_close = [kline[1] for kline in k_lines]
X_last_10_k_lines_close = np.array([k_lines_close])

days = ["1", "3", "5", "7", "15"]
predictions = []
for day in days:
    configuration = {
        "data_input": {
            "X": "./X_" + day + "_day.csv",
        },
        "model": {
            "save_file_name": "./model_" + day + "_day.joblib"
        },
    }
    # fit scaler
    x_input_file_name = configuration["data_input"]["X"]
    X = np.loadtxt(x_input_file_name, delimiter=",")
    scaler = StandardScaler()
    scaler.fit(X)

    # load model
    model_save_file_name = configuration["model"]["save_file_name"]
    model = joblib.load(model_save_file_name)

    # predict
    predict = model.predict(scaler.transform(X_last_10_k_lines_close))
    predictions.append(predict)

values, counts = np.unique(predictions, return_counts=True)
most_common_prediction = values[np.argmax(counts)]
print(str(predictions))
print(str(most_common_prediction))
