"""Install the independent five-minute operational health feed publisher."""
from pathlib import Path
import os
import plistlib
import shutil
import subprocess
home=Path.home();repo=Path(__file__).resolve().parents[1]
base=home/'Library/Application Support/ufo-files/agent-health';base.mkdir(parents=True,exist_ok=True)
for name in ('agent_health.py','agent_activity.py'): shutil.copy2(repo/'scripts'/name,base/name)
label='com.ufo-files.agent-health'
plist={'Label':label,'ProgramArguments':['/opt/homebrew/bin/python3.13',str(base/'agent_health.py'),'--state',str(base/'health.sqlite'),'--output',str(base/'agent-health.json'),'--publish','--watch'],
       'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':60,'WorkingDirectory':str(base),
       'EnvironmentVariables':{'HOME':str(home),'PATH':'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin','PYTHONUNBUFFERED':'1'},
       'StandardOutPath':str(home/'Library/Logs/ufo-files/agent-health.log'),'StandardErrorPath':str(home/'Library/Logs/ufo-files/agent-health.log')}
path=home/'Library/LaunchAgents'/f'{label}.plist';path.write_bytes(plistlib.dumps(plist))
service=f'gui/{os.getuid()}/{label}'
loaded=subprocess.run(['launchctl','print',service],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
subprocess.run(['launchctl','kickstart','-k',service] if loaded else ['launchctl','bootstrap',f'gui/{os.getuid()}',str(path)],check=True)
print('Installed and started',label)
