# Stage 5 user worksheet

Use `samples/unseen/unseen_public_2010-12-01_to_2010-12-05.csv` by itself. It is a public UCI selection that was not used to build the normal demonstration batch.

Before running the tool, calculate these three items yourself on paper or in a separate spreadsheet:

1. How many detail lines are in the file?
2. What is the total quantity?
3. What is the total GBP sales amount? Calculate each line as quantity × unit price before adding.

Then use `app.py` to export the file. Check your three answers against the `Total` row in `Daily Sales`, and check each day against the two matching detail rows.

Do not open `stage5-unseen-expected.json` until after writing your own answers. That file is the independent acceptance baseline.
