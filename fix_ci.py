content = open('.github/workflows/ci.yml', encoding='utf-8').read()

# Fix backend working-directory
content = content.replace(
    '    working-directory: backend',
    '    defaults:\n      run:\n        working-directory: ./backend'
)
content = content.replace(
    '  working-directory: backend',
    '    defaults:\n      run:\n        working-directory: ./backend'
)

# Fix frontend working-directory
content = content.replace(
    '    working-directory: frontend',
    '    defaults:\n      run:\n        working-directory: ./frontend'
)
content = content.replace(
    '  working-directory: frontend',
    '    defaults:\n      run:\n        working-directory: ./frontend'
)

open('.github/workflows/ci.yml', 'w', encoding='utf-8').write(content)
print('Done!')