import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import StandardScaler

days = ["1", "3", "5", "7", "15"]
for day in days:
    configuration = {
        "data_input": {
            "X": "./X_" + day + "_day.csv",
            "Y": "./Y_" + day + "_day.csv"
        },
        "model": {
            "max_depth": 20,
            "n_estimators": 500,
            "save_file_name": "./model_" + day + "_day.joblib"
        },
        "data_testing_percent": 0.90,
    }
    # load the data
    x_input_file_name = configuration["data_input"]["X"]
    y_input_file_name = configuration["data_input"]["Y"]
    X = np.loadtxt(x_input_file_name, delimiter=",")
    Y = np.loadtxt(y_input_file_name, delimiter=",")

    # train the model
    scaler = StandardScaler()
    scaler.fit(X)

    max_depth = configuration["model"]["max_depth"]
    n_estimators = configuration["model"]["n_estimators"]
    model = RandomForestClassifier(max_depth=max_depth, n_estimators=n_estimators)
    model.fit(scaler.transform(X), Y)

    # save the model
    model_save_file_name = configuration["model"]["save_file_name"]
    joblib.dump(model, model_save_file_name)

    # test the model
    data_testing_percent = configuration["data_testing_percent"]
    t = int(len(X) * data_testing_percent)
    X_train, X_test = scaler.transform(X[:t]), scaler.transform(X[t:])
    Y_train, Y_test = Y[:t].copy(), Y[t:].copy()
    Y_pred = model.predict(X_test)

    # test accuracy
    accuracy = accuracy_score(Y_pred, Y_test)
    print("Accuracy with " + day + " days of data: " + str(accuracy * 100) + "%")
