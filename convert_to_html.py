import markdown

# Read the markdown file
with open(r'C:\Users\user\OneDrive\Desktop\rapprochement-bancaire\Complete_User_Guide_Banking_System.md', 'r', encoding='utf-8') as f:
    md_content = f.read()

# Convert markdown to HTML
html_content = markdown.markdown(md_content, extensions=['tables', 'fenced_code'])

# Add professional CSS styling
css_style = """
<style>
    body { 
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
        line-height: 1.6; 
        max-width: 900px; 
        margin: 0 auto; 
        padding: 40px;
        color: #333;
        background-color: #fff;
    }
    h1 { 
        color: #2c3e50; 
        border-bottom: 4px solid #3498db; 
        padding-bottom: 15px; 
        font-size: 28px;
        margin-top: 40px;
    }
    h2 { 
        color: #34495e; 
        border-bottom: 2px solid #95a5a6; 
        padding-bottom: 10px; 
        margin-top: 35px;
        font-size: 22px;
    }
    h3 { 
        color: #7f8c8d; 
        margin-top: 25px;
        font-size: 18px;
    }
    h4 {
        color: #95a5a6;
        margin-top: 20px;
        font-size: 16px;
    }
    table { 
        border-collapse: collapse; 
        width: 100%; 
        margin: 25px 0;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    th, td { 
        border: 1px solid #ddd; 
        padding: 12px 15px; 
        text-align: left;
    }
    th { 
        background-color: #3498db; 
        color: white;
        font-weight: bold;
    }
    tr:nth-child(even) { 
        background-color: #f8f9fa;
    }
    tr:hover {
        background-color: #e8f4f8;
    }
    code {
        background-color: #f4f4f4;
        padding: 3px 6px;
        border-radius: 4px;
        font-family: 'Courier New', monospace;
        font-size: 0.9em;
    }
    pre {
        background-color: #f4f4f4;
        padding: 15px;
        border-radius: 5px;
        overflow-x: auto;
    }
    blockquote {
        border-left: 5px solid #3498db;
        padding-left: 20px;
        margin: 25px 0;
        color: #555;
        background-color: #f8f9fa;
        padding: 15px;
        border-radius: 0 5px 5px 0;
    }
    hr {
        border: none;
        border-top: 3px solid #3498db;
        margin: 35px 0;
    }
    ul, ol {
        margin: 15px 0;
        padding-left: 30px;
    }
    li {
        margin: 8px 0;
    }
    strong {
        color: #2c3e50;
    }
    a {
        color: #3498db;
        text-decoration: none;
    }
    a:hover {
        text-decoration: underline;
    }
    .emoji {
        font-size: 1.2em;
    }
    @media print {
        body {
            max-width: 100%;
            padding: 20px;
        }
        h1, h2, h3, h4 {
            page-break-after: avoid;
        }
        table, blockquote, pre {
            page-break-inside: avoid;
        }
    }
</style>
"""

# Add a professional header
header_html = """
<div style="text-align: center; margin-bottom: 40px; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 10px;">
    <h1 style="color: white; border: none; margin: 0; font-size: 32px;">🏦 Complete User Guide - Banking System</h1>
    <p style="margin: 10px 0 0 0; font-size: 18px;">Fraud Detection & Multi-Banking for Accountants</p>
    <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Created: August 19, 2026 | Target Audience: Accountants and Banking Staff</p>
</div>
"""

# Add a professional footer
footer_html = """
<div style="margin-top: 50px; padding: 20px; background-color: #f8f9fa; border-radius: 10px; text-align: center;">
    <p style="margin: 0; color: #7f8c8d;">This system transforms fraud detection from a manual, error-prone process into an automated, intelligent operation that protects the bank while making accountants' jobs more interesting and impactful!</p>
    <p style="margin: 15px 0 0 0; color: #95a5a6; font-size: 14px;">For questions or support, please contact your system administrator.</p>
    <p style="margin: 10px 0 0 0; color: #95a5a6; font-size: 12px;">Document Version: 1.0 | Last Updated: August 19, 2026</p>
</div>
"""

# Combine everything
full_html = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Complete User Guide - Banking System</title>
    {css_style}
</head>
<body>
    {header_html}
    {html_content}
    {footer_html}
</body>
</html>
"""

# Write HTML file
with open(r'C:\Users\user\OneDrive\Desktop\rapprochement-bancaire\Complete_User_Guide_Banking_System.html', 'w', encoding='utf-8') as f:
    f.write(full_html)

print("HTML file created successfully!")
print("You can now open the HTML file in your browser and print it to PDF.")