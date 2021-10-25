import numpy as np
from binance.client import Client

api = {
    "key": "<placeholder>",
    "secret": "<placeholder>",
    "pair": "BNBUSDT",
}

days = ["1", "3", "5", "7", "15"]
for day in days:
    configuration = {
        "data_time": day + " day UTC",
        "package_size": 10,
        "data_output": {
            "X": "./X_" + day + "_day.csv",
            "Y": "./Y_" + day + "_day.csv"
        }
    }
    # client for binance api
    api_key = api["key"]
    api_secret = api["secret"]
    client = Client(api_key, api_secret)

    # connect to binance
    data_time = configuration["data_time"]
    pair = api["pair"]
    k_lines = client.get_historical_klines(pair, Client.KLINE_INTERVAL_1MINUTE, data_time)
    k_lines_close = [kline[1] for kline in k_lines]

    # process the data
    package_size = configuration["package_size"]
    X_lines = []
    Y_lines = []
    for i in range(package_size, len(k_lines_close) - package_size):
        if k_lines_close[i] < k_lines_close[i + 5]:
            Y_lines.append(1)
        else:
            Y_lines.append(0)
        X_lines.append(k_lines_close[i - package_size:i])

    # save the data
    X = np.array(X_lines)
    Y = np.array(Y_lines)
    x_output_file_name = configuration["data_output"]["X"]
    y_output_file_name = configuration["data_output"]["Y"]
    np.savetxt(x_output_file_name, X, delimiter=",", fmt="%s")
    np.savetxt(y_output_file_name, Y, delimiter=",", fmt="%s")
