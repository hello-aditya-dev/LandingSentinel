LandingSentinel sample data
===========================

All CSV files in this directory are synthetic demo data generated from the
bundled fixture dataset (the Northstar Outfitters demo workspace). Every
campaign name, ad group, spend figure and URL is fictional.

All hostnames use the reserved .test top-level domain (RFC 2606), which can
never resolve on the public internet. Importing these files in production
mode is safe: the scanner will report DNS resolution failures, which is the
expected outcome for a .test domain.

Files
-----
  google-ads-sample.csv          13 rows — Google Ads column layout
  meta-ads-sample.csv            13 rows — Meta Ads column layout
  paid-media-mixed-sample.csv     6 rows — TikTok and LinkedIn rows

The three files together reproduce the seeded demo workspace: 32 rows,
22 unique destinations and GBP 84,260.00 of spend. Import them through
the import wizard (Import → Choose file) one at a time, or use the
synthetic sample loader in the import wizard to load the same dataset
without touching these files.

Spend amounts are in GBP with two decimal places. The "Ad group" column is
empty on rows where the platform does not use ad groups (for example
Adv+ campaigns and TikTok Spark Ads).
