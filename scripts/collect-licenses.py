"""Include wheel license notices in the redistributed Windows folder."""
from importlib.metadata import distributions
from pathlib import Path
import shutil
import sys

destination = Path(sys.argv[1])
destination.mkdir(parents=True, exist_ok=True)
manifest = []
for dist in distributions():
    name = dist.metadata['Name'] or 'unknown'
    manifest.append(name + '==' + dist.version)
    for item in dist.files or []:
        if any(word in item.name.lower() for word in ('license', 'copying', 'copyright', 'notice')):
            source = Path(dist.locate_file(item))
            if source.is_file():
                target = destination / name / Path(str(item).replace('..', '_'))
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
python_license = Path(sys.base_prefix) / 'LICENSE.txt'
if python_license.is_file():
    shutil.copy2(python_license, destination / 'Python-LICENSE.txt')
(destination / 'DEPENDENCIES.txt').write_text('\n'.join(sorted(manifest)), encoding='utf-8')
print('Dependency notices collected.')
