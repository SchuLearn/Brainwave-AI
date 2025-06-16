import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np

# Define the data for the heatmap
heatmap_data = {
    'Accuracy': [19.642857142857142, 26.785714285714285, 26.785714285714285, 28.571428571428573, 30.357142857142858],
    'Balanced Accuracy': [18.55423987776929, 25.259103641456583, 27.860576923076923, 28.57298951048951, 32.38562091503268],
    'Precision': [33.33, 69.23, 33.33, 60.00, 30.00],
    'Recall': [66.67, 75.00, 33.33, 75.00, 37.50],
    'F1 Score': [44.44, 72.00, 33.33, 66.67, 33.33]
}

# Convert the data into a 2D list for the heatmap
heatmap_values = np.array(list(heatmap_data.values()))

# Calculate averages to add to the heatmap
averages = np.mean(heatmap_values, axis=1).reshape(-1, 1)

# Combine the data and the averages
combined_data = np.hstack((heatmap_values, averages))

# Create the heatmap
plt.figure(figsize=(10, 6))
sns.heatmap(combined_data, annot=True, cmap='Blues', fmt=".2f",
            yticklabels=list(heatmap_data.keys()), xticklabels=['Fold 1', 'Fold 2', 'Fold 3', 'Fold 4', 'Fold 5', 'Average'])

# Add title and labels
plt.title('Model Evaluation Metrics')
plt.xlabel('Fold Number')
plt.ylabel('Metrics')

# Show the plot
plt.show()
