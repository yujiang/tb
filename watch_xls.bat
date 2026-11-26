REM 监控xls的修改，自动的转为json，并且如果是npc表格，也会做gen_npcpos
rem call ts-node src\tools\watch_xls.ts
node bin-debug/tools/watch_xls.js
pause

