import pandas as pd
import matplotlib.pyplot as plt

# Data for the 'Information Panel'
data = {
    'Overall Satisfaction': [5, 4, 5, 4, 4, 5, 4],
    'Separated or integrated': [5, 2, 5, 5, 2, 1, 4],
    'Degree of fusion': [5, 3, 5, 4, 2, 3, 3],
}

# Creating DataFrame
df = pd.DataFrame(data)

colors = ["#C4F2C8","#E6DAF7","#E7EBC3","#D8DDF0","#EDD1D1"]


# Create pie charts for each category
fig, axes = plt.subplots(1, 3, figsize=(15, 7))
# Corrected pie chart generation section
for i, (key, value) in enumerate(data.items()):
    # Count the frequency of each rating
    value_counts = pd.Series(value).value_counts().sort_index()
    percentages = (value_counts / len(value) * 100).round(2)
    percentages = percentages[percentages > 0]

    # Create the pie chart
    axes[i].pie(percentages, labels=percentages.index, autopct='%1.1f%%', startangle=90, textprops={'fontsize': 16}, colors=colors)
    axes[i].set_title(f'{key}\n', fontsize=16)

# Improve the layout
plt.tight_layout()

# Add overall title and annotations
plt.suptitle('MultiMedia Metrics', fontsize=20)

# Show the plot
plt.show()
