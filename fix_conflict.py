import re

f = open('frontend/src/pages/RoomResultsPage.jsx', encoding='utf-8')
content = f.read()
f.close()

pattern1 = re.compile(r'<{7} HEAD\n(.*?)={7}\n(.*?)>{7}[^\n]*\n', re.DOTALL)
matches = list(pattern1.finditer(content))
print('Conflicts found:', len(matches))

if len(matches) >= 1:
    m = matches[0]
    head_side = m.group(1)
    incoming_side = m.group(2).strip()
    replacement = incoming_side + '\n\n' + head_side
    content = content[:m.start()] + replacement + content[m.end():]
    print('Fix 1 applied')

pattern2 = re.compile(r'<{7}[^\n]*\n={7}\n(.*?)>{7}[^\n]*\n', re.DOTALL)
matches2 = list(pattern2.finditer(content))

if len(matches2) >= 1:
    m = matches2[0]
    keep_block = m.group(1)
    content = content[:m.start()] + keep_block + content[m.end():]
    print('Fix 2 applied')

open('frontend/src/pages/RoomResultsPage.jsx', 'w', encoding='utf-8').write(content)
print('File saved.')