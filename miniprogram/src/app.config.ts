export default defineAppConfig({
  pages: [
    "pages/home/index",
    "pages/trip/index",
    "pages/share/index",
  ],
  lazyCodeLoading: "requiredComponents",
  window: {
    navigationBarTitleText: "旅行分账",
    navigationBarBackgroundColor: "#f5f7f3",
    navigationBarTextStyle: "black",
    backgroundColor: "#f5f7f3",
  },
});
