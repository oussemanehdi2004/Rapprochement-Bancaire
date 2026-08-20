import markdown
from weasyprint import HTML

# Read the markdown file
with open(r'C:\Users\user\OneDrive\Desktop\rapprochement-bancaire\Complete_User_Guide_Banking_System.md', 'r', encoding='utf-8') as f:
    md_content = f.read()

# Convert markdown to HTML
html_content = markdown.markdown(md_content, extensions=['tables', 'fenced_code'])

# Add some basic CSS styling
css_style = """
<style>
    body { 
        font-family: Arial, sans-serif; 
        line-height: 1.6; 
        max-width: 800px; 
        margin: 0 auto; 
        padding: 20px;
    }
    h1 { 
        color: #2c3e50; 
        border-bottom: 3px solid #3498db; 
        padding-bottom: 10px; 
    }
    h2 { 
        color: #34495e; 
        border-bottom: 2px solid #95a5a6; 
        padding-bottom: 5px; 
        margin-top: 30px;
    }
    h3 { 
        color: #7f8c8d; 
        margin-top: 20px;
    }
    table { 
        border-collapse: collapse; 
        width: 100%; 
        margin: 20px 0;
    }
    th, td { 
        border: 1px solid #ddd; 
        padding: 12px; 
        text-align: left;
    }
    th { 
        background-color: #3498db; 
        color: white;
    }
    tr:nth-child(even) { 
        background-color: #f2f2f2;
    }
    code {
        background-color: #f4f4f4;
        padding: 2px 4px;
        border-radius: 3px;
        font-family: monospace;
    }
    blockquote {
        border-left: 4px solid #3498db;
        padding-left: 20px;
        margin: 20px 0;
        color: #555;
    }
    hr {
        border: none;
        border-top: 2px solid #3498db;
        margin: 30px 0;
    }
</style>
"""

# Combine CSS and HTML
full_html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Complete User Guide - Banking System</title>
    {css_style}
</head>
<body>
    {html_content}
</body>
</html>
"""

# Convert to PDF
HTML(string=full_html).write_pdf(r'C:\Users\user\OneDrive\Desktop\rapprochement-bancaire\Complete_User_Guide_Banking_System.pdf')

print("PDF created successfully!")