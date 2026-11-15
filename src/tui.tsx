import { Plugin } from "@opencode/plugin/tui"

export default Plugin.define({
  id: "speedy-code.tui",
  setup(context) {
    return context.ui.slot({
      append: "home.footer.status",
      render: () => <text fg={context.theme.text.muted}>SPEEDY</text>,
    })
  },
})
