import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import FilterModalShell from "./FilterModalShell";

function HelpItem({ item }) {
  return (
    <View style={styles.itemCard}>
      <Text style={styles.itemTitle}>{item?.title}</Text>
      {!!item?.description && (
        <Text style={styles.itemDescription}>{item.description}</Text>
      )}
      {Array.isArray(item?.bullets) && item.bullets.length > 0 && (
        <View style={styles.bulletsWrap}>
          {item.bullets.map((bullet, index) => (
            <Text key={`${item.title}-${index}`} style={styles.bulletText}>
              • {bullet}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export function FilterHelpModal({ visible, onClose, content }) {
  if (!content) return null;

  return (
    <FilterModalShell
      visible={visible}
      onClose={onClose}
      title={content?.title || "Help"}
      subtitle={content?.subtitle || ""}
      applyLabel="CLOSE"
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!!content?.definition && (
          <View style={styles.definitionBox}>
            <Text style={styles.definitionLabel}>Definition</Text>
            <Text style={styles.definitionText}>{content.definition}</Text>
          </View>
        )}

        {!!content?.imageSource && (
          <View style={styles.diagramCard}>
            <Image
              source={content.imageSource}
              style={styles.diagramImage}
              resizeMode="contain"
            />
            {!!content?.imageCaption && (
              <Text style={styles.diagramCaption}>{content.imageCaption}</Text>
            )}
          </View>
        )}

        {Array.isArray(content?.items) &&
          content.items.map((item) => (
            <HelpItem key={item?.title || item?.description} item={item} />
          ))}
      </ScrollView>
    </FilterModalShell>
  );
}

export default FilterHelpModal;

const styles = StyleSheet.create({
  scroll: {
    maxHeight: "100%",
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 22,
  },

  definitionBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    padding: 12,
    marginBottom: 14,
  },

  definitionLabel: {
    color: "#1d4ed8",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },

  definitionText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },

  diagramCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 8,
    marginBottom: 14,
  },

  diagramImage: {
    width: "100%",
    height: 430,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
  },

  diagramCaption: {
    marginTop: 8,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },

  itemCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 12,
    marginBottom: 10,
  },

  itemTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },

  itemDescription: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 5,
  },

  bulletsWrap: {
    marginTop: 7,
  },

  bulletText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
});
