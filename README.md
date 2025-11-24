# AutoA11yTools.user.js

This script provides many accessibility tools that automatically run on Canvas pages. It also saves your preferences depending on which ones you have activated or not. The script is also usable on any web page, but won't run by default. The following tools are available:

| Tool                       | Usage                                                                                        |
|----------------------------|----------------------------------------------------------------------------------------------|
|Activate All A11y Tools     | Activates all a11y tools.                                                                    |
|Remove All A11y Tools       | Deactivates all a11y tools.                                                                  |
|Image Alt Text              | Adds overlays to images showing their alt text, decorative status, or missing alt text.      |
|Iframe Labels               | Adds overlays to iframes showing their aria-label, aria-description, and title, or missing.  |
|Heading Tags                | Adds overlays to headings showing what level of heading they are.                            |
|Contrast Issues             | Highlights contrast issues with a blue outline.                                              |
|\<i\>\/\<b\> Usage          | Highlights usage of \<i\> and \<b\> tags with a red outline.                                 |
|Lang Attributes             | Highlights potential non-English text that is missing a lang attribute.                      |
|Table Problems              | Highlights tables that need scope attributes or have merged cells.                           |

This script also uses englishWords.txt as part of the lang attributes checking.

# ColorChecker.user.js

This script is a custom color contrast checker tool. Clicking it activates the checker, and then you can hover over text to see the contrast ratio and whether or not it passes the WCAG requirements. It also accounts for font size.

# H5PLanguageSelector.user.js

This script allows you to choose the language when editing an H5P quickly. Simply select the text you'd like to edit, then type Ctrl + q or click the language dropdown menu. It will select the language defined in the code near the top.

# DownloadSLASpreadsheets.user.js

This script automatically runs through four pre-named filters and downloads the Excel files for each filter in Teamwork. The filters are named "SLA - Prototypes", "SLA - 50% Reviews", "SLA - PSIAs", and "SLA - Peer Verifications".
