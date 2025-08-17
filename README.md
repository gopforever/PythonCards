# CardTrack Pro — CSV Import/Export Add-on

Adds CSV Import/Export for inventory. UI styling is unchanged; two small links are placed under the existing JSON buttons.

## CSV format
Header columns (case-sensitive):
id,productName,setName,qty,gradeKey,costBasis,loose-price,graded-price,new-price,cib-price,manual-only-price,bgs-10-price,condition-17-price,condition-18-price,note

- `costBasis` is in dollars (e.g., 12.50). It will be converted to cents internally.
- Price fields are optional; leave blank if unknown.
- Import expects UTF-8 CSV with comma separators and quotes for values that include commas.

