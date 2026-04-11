Check the ham-autocode pipeline state in .ham-autocode/pipeline.json.

If status is "running":
- Report current phase and step
- Check if the active phase has made progress (new commits, new files)
- If no progress in the last check, investigate if something is stuck

If status is "interrupted":
- Report what was interrupted
- Ask if user wants to resume with /ham-autocode:resume

If status is "paused":
- Report paused state, remind user they can /ham-autocode:resume

If status is "completed":
- Say pipeline is done, no action needed

If no pipeline.json exists:
- Say no active pipeline
