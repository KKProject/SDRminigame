<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  description: string
  target?: string
  confirmText: string
  loading?: boolean
}>(), { target: '', loading: false })

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()

const input = ref('')
const inputRef = ref<{ focus: () => void } | null>(null)
const canConfirm = computed(() => input.value.trim() === props.confirmText && !props.loading)

watch(() => props.modelValue, async (open) => {
  if (!open) return
  input.value = ''
  await nextTick()
  inputRef.value?.focus()
})

function close() {
  if (!props.loading) emit('update:modelValue', false)
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    :title="title"
    width="min(92vw, 480px)"
    :close-on-click-modal="!loading"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="danger-dialog">
      <div class="danger-dialog__mark" aria-hidden="true">
        !
      </div>
      <div>
        <p class="danger-dialog__description">
          {{ description }}
        </p>
        <p v-if="target" class="danger-dialog__target">
          目标：<code>{{ target }}</code>
        </p>
      </div>
    </div>
    <label class="field-label" for="danger-confirm-input">
      输入 <code>{{ confirmText }}</code> 确认
    </label>
    <ElInput
      id="danger-confirm-input"
      ref="inputRef"
      v-model="input"
      autocomplete="off"
      :disabled="loading"
      @keyup.enter="canConfirm && emit('confirm')"
    />
    <template #footer>
      <ElButton :disabled="loading" @click="close">
        取消
      </ElButton>
      <ElButton type="danger" :loading="loading" :disabled="!canConfirm" @click="emit('confirm')">
        确认执行
      </ElButton>
    </template>
  </ElDialog>
</template>
